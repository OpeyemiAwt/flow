import { type BalanceObservation } from "../../../domain/assets.ts";
import { FlowError } from "../../../foundation/errors.ts";
import type { FlowDb } from "../../../foundation/prisma.ts";
import { upsertWalletBalance } from "../asset-service.ts";
import {
  fetchBaseNativeBalance,
  fetchBaseTokenBalance,
} from "./base-connector.ts";
import {
  fetchNearNativeBalance,
  fetchNearTokenBalance,
} from "./near-connector.ts";
import {
  fetchSolanaNativeBalance,
  fetchSolanaTokenBalance,
} from "./solana-connector.ts";

export interface EndpointPair {
  readonly primary: string;
  readonly fallback?: string;
}

export interface MultiChainRpcConfig {
  readonly ethereum?: EndpointPair;
  readonly near?: EndpointPair;
  readonly base?: EndpointPair;
  readonly solana?: EndpointPair;
}

export function getDefaultRpcConfig(
  environment: "testnet" | "mainnet",
): MultiChainRpcConfig {
  if (environment === "testnet") {
    return {
      near: {
        primary:
          process.env.FLOW_NEAR_RPC_URL || "https://rpc.testnet.near.org",
        fallback: "https://testnet.neardata.info/v1/rpc",
      },
      base: {
        primary: process.env.FLOW_BASE_RPC_URL || "https://sepolia.base.org",
        fallback: "https://base-sepolia-rpc.publicnode.com",
      },
      solana: {
        primary:
          process.env.FLOW_SOLANA_RPC_URL || "https://api.devnet.solana.com",
        fallback: "https://solana-devnet-rpc.publicnode.com",
      },
    };
  }

  return {
    ethereum: {
      primary:
        process.env.FLOW_ETHEREUM_RPC_URL ||
        "https://ethereum-rpc.publicnode.com",
      fallback: "https://eth.merkle.io",
    },
    near: {
      primary:
        process.env.FLOW_NEAR_RPC_URL || "https://rpc.mainnet.fastnear.com",
      fallback: "https://free.rpc.fastnear.com",
    },
    base: {
      primary: process.env.FLOW_BASE_RPC_URL || "https://mainnet.base.org",
      fallback: "https://base-rpc.publicnode.com",
    },
    solana: {
      primary:
        process.env.FLOW_SOLANA_RPC_URL ||
        "https://solana-rpc.publicnode.com",
      fallback: "https://api.mainnet-beta.solana.com",
    },
  };
}

export interface ReconcileResult {
  readonly walletId: string;
  readonly environment: string;
  readonly observations: ReadonlyArray<
    BalanceObservation & {
      readonly symbol: string;
      readonly network: string;
      readonly chainId: string;
      readonly address: string;
      readonly contractAddress: string | null;
    }
  >;
}

/**
 * Connects to live blockchain RPC endpoints and reconciles all registered network balances
 * for a wallet into flow.wallet_balances.
 */
export async function reconcileWalletBalances(
  db: FlowDb,
  walletId: string,
  config?: MultiChainRpcConfig,
): Promise<ReconcileResult> {
  // 1. Fetch wallet
  const wallets = await db.$queryRaw<
    Array<{ id: string; environment: string }>
  >`
    SELECT id, environment FROM flow.wallets WHERE id = ${walletId}::uuid
  `;
  const wallet = wallets[0];
  if (!wallet) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      `Wallet not found: ${walletId}`,
    );
  }

  const env = wallet.environment as "testnet" | "mainnet";
  const rpc = config ?? getDefaultRpcConfig(env);

  // 2. Fetch registered addresses for this wallet
  const addresses = await db.$queryRaw<
    Array<{ id: string; network: string; chainId: string; address: string }>
  >`
    SELECT id, network, chain_id as "chainId", address
    FROM flow.wallet_addresses
    WHERE wallet_id = ${walletId}::uuid
    ORDER BY network
  `;

  if (addresses.length === 0) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      `Wallet ${walletId} has no registered addresses.`,
    );
  }

  // 3. Fetch verified network assets matching the wallet's environment
  const networkAssets = await db.$queryRaw<
    Array<{
      id: string;
      network: string;
      chainId: string;
      tokenStandard: string;
      contractAddress: string | null;
      decimals: number;
      symbol: string;
    }>
  >`
    SELECT
      na.id,
      na.network,
      na.chain_id as "chainId",
      na.token_standard as "tokenStandard",
      na.contract_address as "contractAddress",
      na.decimals,
      a.symbol
    FROM flow.network_assets na
    JOIN flow.assets a ON a.id = na.asset_id
    WHERE na.is_verified = true
      AND na.status = 'ACTIVE'
    ORDER BY na.network, na.chain_id, a.symbol
  `;

  const results: Array<
    BalanceObservation & {
      symbol: string;
      network: string;
      chainId: string;
      address: string;
      contractAddress: string | null;
    }
  > = [];

  const tasks: Array<{
    addr: (typeof addresses)[number];
    asset: (typeof networkAssets)[number];
    fetchObs: () => Promise<BalanceObservation>;
  }> = [];

  for (const addr of addresses) {
    // Find matching assets for this network and chain
    const matchingAssets = networkAssets.filter(
      (a) => a.network === addr.network && a.chainId === addr.chainId,
    );

    for (const asset of matchingAssets) {
      if (asset.network === "ethereum") {
        const ethRpc =
          rpc.ethereum?.primary ?? "https://ethereum-rpc.publicnode.com";
        const fallback = rpc.ethereum?.fallback ?? "https://eth.merkle.io";

        if (asset.tokenStandard === "NATIVE") {
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchBaseNativeBalance(ethRpc, addr.address, asset.chainId, {
                networkAssetId: asset.id,
                fallbackEndpoint: fallback,
              }),
          });
        } else if (asset.contractAddress) {
          const contractAddress = asset.contractAddress;
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchBaseTokenBalance(
                ethRpc,
                addr.address,
                contractAddress,
                asset.chainId,
                {
                  networkAssetId: asset.id,
                  fallbackEndpoint: fallback,
                },
              ),
          });
        }
      } else if (asset.network === "near") {
        const nearRpc = rpc.near?.primary ?? "https://rpc.testnet.near.org";
        const fallback = rpc.near?.fallback;
        const net = asset.chainId as "near-mainnet" | "near-testnet";

        if (asset.tokenStandard === "NATIVE") {
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchNearNativeBalance(nearRpc, addr.address, net, {
                networkAssetId: asset.id,
                fallbackEndpoint: fallback,
              }),
          });
        } else if (asset.contractAddress) {
          const contractAddress = asset.contractAddress;
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchNearTokenBalance(
                nearRpc,
                addr.address,
                contractAddress,
                net,
                {
                  networkAssetId: asset.id,
                  fallbackEndpoint: fallback,
                },
              ),
          });
        }
      } else if (asset.network === "base") {
        const baseRpc = rpc.base?.primary ?? "https://sepolia.base.org";
        const fallback = rpc.base?.fallback;

        if (asset.tokenStandard === "NATIVE") {
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchBaseNativeBalance(baseRpc, addr.address, asset.chainId, {
                networkAssetId: asset.id,
                fallbackEndpoint: fallback,
              }),
          });
        } else if (asset.contractAddress) {
          const contractAddress = asset.contractAddress;
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchBaseTokenBalance(
                baseRpc,
                addr.address,
                contractAddress,
                asset.chainId,
                {
                  networkAssetId: asset.id,
                  fallbackEndpoint: fallback,
                },
              ),
          });
        }
      } else if (asset.network === "solana") {
        const solanaRpc =
          rpc.solana?.primary ?? "https://api.devnet.solana.com";
        const fallback = rpc.solana?.fallback;
        const net = asset.chainId as "solana-mainnet" | "solana-devnet";

        if (asset.tokenStandard === "NATIVE") {
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchSolanaNativeBalance(solanaRpc, addr.address, net, {
                networkAssetId: asset.id,
                fallbackEndpoint: fallback,
              }),
          });
        } else if (asset.contractAddress) {
          const contractAddress = asset.contractAddress;
          tasks.push({
            addr,
            asset,
            fetchObs: () =>
              fetchSolanaTokenBalance(
                solanaRpc,
                addr.address,
                contractAddress,
                net,
                {
                  networkAssetId: asset.id,
                  fallbackEndpoint: fallback,
                },
              ),
          });
        }
      }
    }
  }

  const settled = await Promise.allSettled(
    tasks.map(async (task) => ({
      task,
      obs: await task.fetchObs(),
    })),
  );

  let firstError: unknown = null;
  const fetched: Array<{
    task: (typeof tasks)[number];
    obs: BalanceObservation;
  }> = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      fetched.push(outcome.value);
    } else if (firstError === null) {
      firstError = outcome.reason;
    }
  }

  if (tasks.length > 0 && fetched.length === 0 && firstError !== null) {
    throw firstError;
  }

  for (const { task, obs } of fetched) {
    // Persist observation into flow.wallet_balances
    await upsertWalletBalance(db, {
      walletId,
      networkAssetId: obs.networkAssetId,
      tokenAccountAddress: obs.tokenAccountAddress,
      atomicBalance: obs.atomicBalance,
      blockHeight: obs.blockHeight,
      blockTimestamp: obs.blockTimestamp,
      finality: obs.finality,
      syncStatus: obs.syncStatus,
      lastError: obs.lastError,
    });

    results.push({
      ...obs,
      symbol: task.asset.symbol,
      network: task.asset.network,
      chainId: task.asset.chainId,
      address: task.addr.address,
      contractAddress: task.asset.contractAddress,
    });
  }

  return {
    walletId,
    environment: wallet.environment,
    observations: results,
  };
}

/**
 * Fetches a fresh live mainnet balance observation directly from the chain RPC
 * for a single asset deployment and wallet address.
 */
export async function fetchLiveMainnetBalance(params: {
  readonly networkKey:
    | "ethereum"
    | "base"
    | "solana"
    | "near"
    | "ethereum-mainnet"
    | "base-mainnet"
    | "solana-mainnet"
    | "near-mainnet";
  readonly standard: "NATIVE" | "ERC20" | "SPL" | "NEP141";
  readonly contractIdentifier: string;
  readonly address: string;
  readonly networkAssetId?: string;
}): Promise<BalanceObservation> {
  const rpc = getDefaultRpcConfig("mainnet");
  const networkAssetId = params.networkAssetId ?? params.contractIdentifier;
  const normalizedNetwork = params.networkKey.replace(/-mainnet$/, "");

  if (normalizedNetwork === "ethereum") {
    const primary =
      rpc.ethereum?.primary ?? "https://ethereum-rpc.publicnode.com";
    const fallback = rpc.ethereum?.fallback ?? "https://eth.merkle.io";
    return params.standard === "NATIVE"
      ? fetchBaseNativeBalance(primary, params.address, "1", {
          networkAssetId,
          fallbackEndpoint: fallback,
        })
      : fetchBaseTokenBalance(
          primary,
          params.address,
          params.contractIdentifier,
          "1",
          { networkAssetId, fallbackEndpoint: fallback },
        );
  }

  if (normalizedNetwork === "base") {
    const primary = rpc.base?.primary ?? "https://mainnet.base.org";
    const fallback = rpc.base?.fallback;
    return params.standard === "NATIVE"
      ? fetchBaseNativeBalance(primary, params.address, "8453", {
          networkAssetId,
          fallbackEndpoint: fallback,
        })
      : fetchBaseTokenBalance(
          primary,
          params.address,
          params.contractIdentifier,
          "8453",
          { networkAssetId, fallbackEndpoint: fallback },
        );
  }

  if (normalizedNetwork === "solana") {
    const primary =
      rpc.solana?.primary ?? "https://solana-rpc.publicnode.com";
    const fallback = rpc.solana?.fallback;
    return params.standard === "NATIVE"
      ? fetchSolanaNativeBalance(primary, params.address, "solana-mainnet", {
          networkAssetId,
          fallbackEndpoint: fallback,
        })
      : fetchSolanaTokenBalance(
          primary,
          params.address,
          params.contractIdentifier,
          "solana-mainnet",
          { networkAssetId, fallbackEndpoint: fallback },
        );
  }

  const primary = rpc.near?.primary ?? "https://rpc.mainnet.fastnear.com";
  const fallback = rpc.near?.fallback ?? "https://free.rpc.fastnear.com";
  return params.standard === "NATIVE"
    ? fetchNearNativeBalance(primary, params.address, "near-mainnet", {
        networkAssetId,
        fallbackEndpoint: fallback,
      })
    : fetchNearTokenBalance(
        primary,
        params.address,
        params.contractIdentifier,
        "near-mainnet",
        { networkAssetId, fallbackEndpoint: fallback },
      );
}
