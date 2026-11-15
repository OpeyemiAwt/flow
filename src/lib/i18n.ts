export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "fr",
  "pt",
  "zh",
  "ja",
  "ko",
  "ar",
  "de",
] as const;

export type FlowLocale = (typeof SUPPORTED_LOCALES)[number];

export interface LocaleMeta {
  readonly code: FlowLocale;
  readonly nativeName: string;
  readonly englishName: string;
  readonly dir: "ltr" | "rtl";
}

export const LOCALE_META: Record<FlowLocale, LocaleMeta> = {
  en: { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
  es: { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
  fr: { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
  pt: { code: "pt", nativeName: "Português", englishName: "Portuguese", dir: "ltr" },
  zh: { code: "zh", nativeName: "简体中文", englishName: "Chinese (Simplified)", dir: "ltr" },
  ja: { code: "ja", nativeName: "日本語", englishName: "Japanese", dir: "ltr" },
  ko: { code: "ko", nativeName: "한국어", englishName: "Korean", dir: "ltr" },
  ar: { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  de: { code: "de", nativeName: "Deutsch", englishName: "German", dir: "ltr" },
};

export const FLOW_LOCALE_STORAGE_KEY = "flow-locale";
export const FLOW_LOCALE_COOKIE = "flow_locale";
export const LOCALE_CHANGE_EVENT = "flow-locale-change";

export function isSupportedLocale(value: unknown): value is FlowLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeLocale(value: unknown): FlowLocale {
  if (isSupportedLocale(value)) return value;
  if (typeof value === "string") {
    const short = value.trim().toLowerCase().split(/[-_]/)[0];
    if (isSupportedLocale(short)) return short;
  }
  return "en";
}

export function readStoredLocale(): FlowLocale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(FLOW_LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
    const cookieMatch = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${FLOW_LOCALE_COOKIE}=`));
    if (cookieMatch) {
      const val = decodeURIComponent(cookieMatch.split("=")[1] ?? "");
      if (isSupportedLocale(val)) return val;
    }
    if (navigator.language) {
      return normalizeLocale(navigator.language);
    }
  } catch {
    // ignore storage errors
  }
  return "en";
}

export function applyLocale(next: FlowLocale): void {
  if (typeof window === "undefined") return;
  const meta = LOCALE_META[next];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;
  try {
    window.localStorage.setItem(FLOW_LOCALE_STORAGE_KEY, next);
    document.cookie = `${FLOW_LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}

export interface FlowTranslations {
  // Navigation & common
  navHome: string;
  navSend: string;
  navConvert: string;
  navEarn: string;
  navActivity: string;
  navInsights: string;
  navSettings: string;
  navAnalytics: string;
  navSignOut: string;
  backToWallet: string;
  refresh: string;
  refreshing: string;
  allTime: string;
  allAccounts: string;
  allAssets: string;
  allNetworks: string;

  // Settings
  settingsTitle: string;
  settingsLanguageLabel: string;
  settingsLanguageDesc: string;
  settingsAppearanceLabel: string;
  settingsAppearanceDesc: string;
  settingsSecurityTitle: string;

  // Portfolio / Wallet actions
  actionAddMoney: string;
  actionSend: string;
  actionConvert: string;
  actionEarn: string;
  totalBalance: string;

  // Insights
  insightsEyebrow: string;
  insightsTitle: string;
  insightsSubtitlePrefix: string;
  insightsSubtitleTo: string;
  insightsTotalIn: string;
  insightsTotalOut: string;
  insightsCurrentBalance: string;
  insightsNetPeriodFlow: string;
  insightsHighestInMonth: string;
  insightsHighestOutMonth: string;
  insightsNoInflowsYet: string;
  insightsNoOutflowsYet: string;
  insightsPeakInHint: string;
  insightsPeakOutHint: string;
  insightsChartTitle: string;
  insightsChartSubtitle: string;
  insightsModeFlow: string;
  insightsModeNet: string;
  insightsPeakInBadge: string;
  insightsPeakOutBadge: string;
  insightsAssetBreakdown: string;
  insightsNoActivityInMonth: string;
  insightsTableTitle: string;
  insightsColMonth: string;
  insightsColInflow: string;
  insightsColOutflow: string;
  insightsColNet: string;
  insightsColTx: string;

  // Sign-in
  signInTitle: string;
  signInSubtitle: string;
  signInWithGoogle: string;
  signInWithEmail: string;
  signInSendCode: string;
}

export const MESSAGES: Record<FlowLocale, FlowTranslations> = {
  en: {
    navHome: "Home",
    navSend: "Send",
    navConvert: "Convert",
    navEarn: "Earn",
    navActivity: "Activity",
    navInsights: "Insights",
    navSettings: "Settings",
    navAnalytics: "Analytics",
    navSignOut: "Sign out",
    backToWallet: "Back to Wallet",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    allTime: "All Time",
    allAccounts: "All Accounts",
    allAssets: "All Assets",
    allNetworks: "All Networks",
    settingsTitle: "Settings",
    settingsLanguageLabel: "Language",
    settingsLanguageDesc: "Choose your preferred display language across FLOW.",
    settingsAppearanceLabel: "Appearance Theme",
    settingsAppearanceDesc: "Toggle between clean light and deep dark visual styles.",
    settingsSecurityTitle: "Security & Authentication",
    actionAddMoney: "Add Money",
    actionSend: "Send",
    actionConvert: "Convert",
    actionEarn: "Earn",
    totalBalance: "Total Balance",
    insightsEyebrow: "Personal Cashflow & Performance",
    insightsTitle: "Your FLOW Insights",
    insightsSubtitlePrefix: "Tracking your mainnet inflows, outflows, and balance from",
    insightsSubtitleTo: "to",
    insightsTotalIn: "Total Moved In",
    insightsTotalOut: "Total Left (Outflow)",
    insightsCurrentBalance: "Current Balance",
    insightsNetPeriodFlow: "Net period flow:",
    insightsHighestInMonth: "Highest Inflow Month",
    insightsHighestOutMonth: "Highest Outflow Month",
    insightsNoInflowsYet: "No inflows yet",
    insightsNoOutflowsYet: "No outflows yet",
    insightsPeakInHint: "Deposits and received payments will highlight your peak month.",
    insightsPeakOutHint: "Sends and swaps will highlight your peak month.",
    insightsChartTitle: "Monthly Cashflow Analysis",
    insightsChartSubtitle: "Hover or tap any month to inspect exact inflow, outflow, and asset breakdown.",
    insightsModeFlow: "Inflow vs Outflow",
    insightsModeNet: "Net Cashflow",
    insightsPeakInBadge: "Peak Inflow",
    insightsPeakOutBadge: "Peak Outflow",
    insightsAssetBreakdown: "Asset Breakdown",
    insightsNoActivityInMonth: "No settled mainnet inflows or outflows recorded in",
    insightsTableTitle: "Month-by-Month Summary",
    insightsColMonth: "Month",
    insightsColInflow: "Inflow",
    insightsColOutflow: "Outflow",
    insightsColNet: "Net",
    insightsColTx: "Tx",
    signInTitle: "Sign in to FLOW",
    signInSubtitle: "Multi-chain money, simplified.",
    signInWithGoogle: "Continue with Google",
    signInWithEmail: "Continue with Email",
    signInSendCode: "Send verification code",
  },
  es: {
    navHome: "Inicio",
    navSend: "Enviar",
    navConvert: "Convertir",
    navEarn: "Ganar",
    navActivity: "Actividad",
    navInsights: "Estadísticas",
    navSettings: "Configuración",
    navAnalytics: "Analítica",
    navSignOut: "Cerrar sesión",
    backToWallet: "Volver a la cartera",
    refresh: "Actualizar",
    refreshing: "Actualizando...",
    allTime: "Todo el tiempo",
    allAccounts: "Todas las cuentas",
    allAssets: "Todos los activos",
    allNetworks: "Todas las redes",
    settingsTitle: "Configuración",
    settingsLanguageLabel: "Idioma",
    settingsLanguageDesc: "Elige tu idioma preferido en todo FLOW.",
    settingsAppearanceLabel: "Tema de apariencia",
    settingsAppearanceDesc: "Alterna entre estilos claro limpio y oscuro profundo.",
    settingsSecurityTitle: "Seguridad y autenticación",
    actionAddMoney: "Agregar dinero",
    actionSend: "Enviar",
    actionConvert: "Convertir",
    actionEarn: "Ganar",
    totalBalance: "Saldo total",
    insightsEyebrow: "Flujo de caja personal y rendimiento",
    insightsTitle: "Tus estadísticas en FLOW",
    insightsSubtitlePrefix: "Seguimiento de tus entradas, salidas y saldo en mainnet desde",
    insightsSubtitleTo: "hasta",
    insightsTotalIn: "Total ingresado",
    insightsTotalOut: "Total salido",
    insightsCurrentBalance: "Saldo actual",
    insightsNetPeriodFlow: "Flujo neto del período:",
    insightsHighestInMonth: "Mes con mayor entrada",
    insightsHighestOutMonth: "Mes con mayor salida",
    insightsNoInflowsYet: "Sin entradas aún",
    insightsNoOutflowsYet: "Sin salidas aún",
    insightsPeakInHint: "Los depósitos y pagos recibidos destacarán tu mes pico.",
    insightsPeakOutHint: "Los envíos y conversiones destacarán tu mes pico.",
    insightsChartTitle: "Análisis mensual de flujo de caja",
    insightsChartSubtitle: "Pasa el cursor o toca cualquier mes para ver entradas, salidas y desglose por activo.",
    insightsModeFlow: "Entradas vs Salidas",
    insightsModeNet: "Flujo neto",
    insightsPeakInBadge: "Pico de entrada",
    insightsPeakOutBadge: "Pico de salida",
    insightsAssetBreakdown: "Desglose por activo",
    insightsNoActivityInMonth: "No hay entradas ni salidas liquidadas en mainnet en",
    insightsTableTitle: "Resumen mes a mes",
    insightsColMonth: "Mes",
    insightsColInflow: "Entrada",
    insightsColOutflow: "Salida",
    insightsColNet: "Neto",
    insightsColTx: "Tx",
    signInTitle: "Inicia sesión en FLOW",
    signInSubtitle: "Dinero multicadena, simplificado.",
    signInWithGoogle: "Continuar con Google",
    signInWithEmail: "Continuar con correo",
    signInSendCode: "Enviar código de verificación",
  },
  fr: {
    navHome: "Accueil",
    navSend: "Envoyer",
    navConvert: "Convertir",
    navEarn: "Épargner",
    navActivity: "Activité",
    navInsights: "Aperçus",
    navSettings: "Paramètres",
    navAnalytics: "Analytique",
    navSignOut: "Se déconnecter",
    backToWallet: "Retour au portefeuille",
    refresh: "Actualiser",
    refreshing: "Actualisation...",
    allTime: "Tout",
    allAccounts: "Tous les comptes",
    allAssets: "Tous les actifs",
    allNetworks: "Tous les réseaux",
    settingsTitle: "Paramètres",
    settingsLanguageLabel: "Langue",
    settingsLanguageDesc: "Choisissez votre langue d'affichage dans FLOW.",
    settingsAppearanceLabel: "Thème d'apparence",
    settingsAppearanceDesc: "Basculez entre le mode clair épuré et le mode sombre profond.",
    settingsSecurityTitle: "Sécurité et authentification",
    actionAddMoney: "Déposer",
    actionSend: "Envoyer",
    actionConvert: "Convertir",
    actionEarn: "Gagner",
    totalBalance: "Solde total",
    insightsEyebrow: "Trésorerie personnelle & performance",
    insightsTitle: "Vos aperçus FLOW",
    insightsSubtitlePrefix: "Suivi de vos entrées, sorties et solde sur mainnet du",
    insightsSubtitleTo: "au",
    insightsTotalIn: "Total entré",
    insightsTotalOut: "Total sorti",
    insightsCurrentBalance: "Solde actuel",
    insightsNetPeriodFlow: "Flux net de la période :",
    insightsHighestInMonth: "Meilleur mois d'entrée",
    insightsHighestOutMonth: "Plus fort mois de sortie",
    insightsNoInflowsYet: "Aucune entrée encore",
    insightsNoOutflowsYet: "Aucune sortie encore",
    insightsPeakInHint: "Les dépôts et paiements reçus mettront en avant votre mois record.",
    insightsPeakOutHint: "Les envois et échanges mettront en avant votre mois record.",
    insightsChartTitle: "Analyse mensuelle des flux",
    insightsChartSubtitle: "Survolez ou touchez un mois pour inspecter les flux et la répartition par actif.",
    insightsModeFlow: "Entrées vs Sorties",
    insightsModeNet: "Flux net",
    insightsPeakInBadge: "Pic d'entrée",
    insightsPeakOutBadge: "Pic de sortie",
    insightsAssetBreakdown: "Répartition par actif",
    insightsNoActivityInMonth: "Aucun flux mainnet réglé enregistré en",
    insightsTableTitle: "Résumé mois par mois",
    insightsColMonth: "Mois",
    insightsColInflow: "Entrée",
    insightsColOutflow: "Sortie",
    insightsColNet: "Net",
    insightsColTx: "Tx",
    signInTitle: "Se connecter à FLOW",
    signInSubtitle: "La finance multi-chaînes, simplifiée.",
    signInWithGoogle: "Continuer avec Google",
    signInWithEmail: "Continuer par e-mail",
    signInSendCode: "Envoyer le code de vérification",
  },
  pt: {
    navHome: "Início",
    navSend: "Enviar",
    navConvert: "Converter",
    navEarn: "Render",
    navActivity: "Atividade",
    navInsights: "Insights",
    navSettings: "Configurações",
    navAnalytics: "Analítica",
    navSignOut: "Sair",
    backToWallet: "Voltar à carteira",
    refresh: "Atualizar",
    refreshing: "Atualizando...",
    allTime: "Todo o período",
    allAccounts: "Todas as contas",
    allAssets: "Todos os ativos",
    allNetworks: "Todas as redes",
    settingsTitle: "Configurações",
    settingsLanguageLabel: "Idioma",
    settingsLanguageDesc: "Escolha seu idioma preferido no FLOW.",
    settingsAppearanceLabel: "Tema de aparência",
    settingsAppearanceDesc: "Alterne entre o estilo claro limpo e o escuro profundo.",
    settingsSecurityTitle: "Segurança e autenticação",
    actionAddMoney: "Adicionar",
    actionSend: "Enviar",
    actionConvert: "Converter",
    actionEarn: "Render",
    totalBalance: "Saldo total",
    insightsEyebrow: "Fluxo de caixa pessoal e desempenho",
    insightsTitle: "Seus Insights no FLOW",
    insightsSubtitlePrefix: "Acompanhando entradas, saídas e saldo na mainnet de",
    insightsSubtitleTo: "até",
    insightsTotalIn: "Total que entrou",
    insightsTotalOut: "Total que saiu",
    insightsCurrentBalance: "Saldo atual",
    insightsNetPeriodFlow: "Fluxo líquido do período:",
    insightsHighestInMonth: "Mês de maior entrada",
    insightsHighestOutMonth: "Mês de maior saída",
    insightsNoInflowsYet: "Sem entradas ainda",
    insightsNoOutflowsYet: "Sem saídas ainda",
    insightsPeakInHint: "Depósitos e pagamentos recebidos destacarão seu mês recorde.",
    insightsPeakOutHint: "Envios e conversões destacarão seu mês recorde.",
    insightsChartTitle: "Análise mensal de fluxo de caixa",
    insightsChartSubtitle: "Passe o mouse ou toque em qualquer mês para ver entradas, saídas e ativos.",
    insightsModeFlow: "Entrada vs Saída",
    insightsModeNet: "Fluxo líquido",
    insightsPeakInBadge: "Pico de entrada",
    insightsPeakOutBadge: "Pico de saída",
    insightsAssetBreakdown: "Detalhamento por ativo",
    insightsNoActivityInMonth: "Nenhuma movimentação liquidada na mainnet em",
    insightsTableTitle: "Resumo mês a mês",
    insightsColMonth: "Mês",
    insightsColInflow: "Entrada",
    insightsColOutflow: "Saída",
    insightsColNet: "Líquido",
    insightsColTx: "Tx",
    signInTitle: "Entrar no FLOW",
    signInSubtitle: "Dinheiro multi-chain, simplificado.",
    signInWithGoogle: "Continuar com Google",
    signInWithEmail: "Continuar com e-mail",
    signInSendCode: "Enviar código de verificação",
  },
  zh: {
    navHome: "首页",
    navSend: "发送",
    navConvert: "兑换",
    navEarn: "赚取",
    navActivity: "活动",
    navInsights: "数据洞察",
    navSettings: "设置",
    navAnalytics: "平台分析",
    navSignOut: "退出登录",
    backToWallet: "返回钱包",
    refresh: "刷新",
    refreshing: "刷新中...",
    allTime: "全部时间",
    allAccounts: "全部账户",
    allAssets: "全部资产",
    allNetworks: "全部网络",
    settingsTitle: "设置",
    settingsLanguageLabel: "语言",
    settingsLanguageDesc: "选择您在 FLOW 中使用的显示语言。",
    settingsAppearanceLabel: "外观主题",
    settingsAppearanceDesc: "在浅色与深色界面之间切换。",
    settingsSecurityTitle: "安全与身份验证",
    actionAddMoney: "充值",
    actionSend: "发送",
    actionConvert: "兑换",
    actionEarn: "赚取",
    totalBalance: "总余额",
    insightsEyebrow: "个人资金流与表现",
    insightsTitle: "您的 FLOW 洞察",
    insightsSubtitlePrefix: "追踪主网资金流入、流出与余额，时间范围：",
    insightsSubtitleTo: "至",
    insightsTotalIn: "累计流入",
    insightsTotalOut: "累计流出",
    insightsCurrentBalance: "当前余额",
    insightsNetPeriodFlow: "周期净流入：",
    insightsHighestInMonth: "最高流入月份",
    insightsHighestOutMonth: "最高流出月份",
    insightsNoInflowsYet: "暂无流入",
    insightsNoOutflowsYet: "暂无流出",
    insightsPeakInHint: "充值和收款记录将高亮您的峰值月份。",
    insightsPeakOutHint: "转账和兑换记录将高亮您的峰值月份。",
    insightsChartTitle: "月度资金流分析",
    insightsChartSubtitle: "悬停或点击任意月份，查看流入、流出及资产明细。",
    insightsModeFlow: "流入 vs 流出",
    insightsModeNet: "净资金流",
    insightsPeakInBadge: "流入峰值",
    insightsPeakOutBadge: "流出峰值",
    insightsAssetBreakdown: "资产明细",
    insightsNoActivityInMonth: "该月暂无已结算的主网流入或流出记录：",
    insightsTableTitle: "按月汇总",
    insightsColMonth: "月份",
    insightsColInflow: "流入",
    insightsColOutflow: "流出",
    insightsColNet: "净额",
    insightsColTx: "笔数",
    signInTitle: "登录 FLOW",
    signInSubtitle: "化繁为简的多链资金体验。",
    signInWithGoogle: "使用 Google 继续",
    signInWithEmail: "使用邮箱继续",
    signInSendCode: "发送验证码",
  },
  ja: {
    navHome: "ホーム",
    navSend: "送金",
    navConvert: "スワップ",
    navEarn: "運用",
    navActivity: "履歴",
    navInsights: "インサイト",
    navSettings: "設定",
    navAnalytics: "分析",
    navSignOut: "ログアウト",
    backToWallet: "ウォレットへ戻る",
    refresh: "更新",
    refreshing: "更新中...",
    allTime: "全期間",
    allAccounts: "すべてのアカウント",
    allAssets: "すべての資産",
    allNetworks: "すべてのネットワーク",
    settingsTitle: "設定",
    settingsLanguageLabel: "言語",
    settingsLanguageDesc: "FLOW全体で使用する表示言語を選択します。",
    settingsAppearanceLabel: "外観テーマ",
    settingsAppearanceDesc: "ライトモードとダークモードを切り替えます。",
    settingsSecurityTitle: "セキュリティと認証",
    actionAddMoney: "入金",
    actionSend: "送金",
    actionConvert: "変換",
    actionEarn: "運用",
    totalBalance: "合計残高",
    insightsEyebrow: "個人キャッシュフローと実績",
    insightsTitle: "FLOW インサイト",
    insightsSubtitlePrefix: "メインネットの入出金と残高を追跡：",
    insightsSubtitleTo: "〜",
    insightsTotalIn: "累計入金",
    insightsTotalOut: "累計出金",
    insightsCurrentBalance: "現在残高",
    insightsNetPeriodFlow: "期間純フロー：",
    insightsHighestInMonth: "最大入金の月",
    insightsHighestOutMonth: "最大出金の月",
    insightsNoInflowsYet: "まだ入金はありません",
    insightsNoOutflowsYet: "まだ出金はありません",
    insightsPeakInHint: "入金や受取が記録されるとピーク月が表示されます。",
    insightsPeakOutHint: "送金やスワップが記録されるとピーク月が表示されます。",
    insightsChartTitle: "月次キャッシュフロー分析",
    insightsChartSubtitle: "各月にホバーまたはタップして入出金と資産内訳を確認できます。",
    insightsModeFlow: "入金 vs 出金",
    insightsModeNet: "純キャッシュフロー",
    insightsPeakInBadge: "入金ピーク",
    insightsPeakOutBadge: "出金ピーク",
    insightsAssetBreakdown: "資産内訳",
    insightsNoActivityInMonth: "確定したメインネットの入出金記録はありません：",
    insightsTableTitle: "月別サマリー",
    insightsColMonth: "月",
    insightsColInflow: "入金",
    insightsColOutflow: "出金",
    insightsColNet: "純額",
    insightsColTx: "件数",
    signInTitle: "FLOW にサインイン",
    signInSubtitle: "マルチチェーン資産をシンプルに。",
    signInWithGoogle: "Google で続ける",
    signInWithEmail: "メールで続ける",
    signInSendCode: "認証コードを送信",
  },
  ko: {
    navHome: "홈",
    navSend: "보내기",
    navConvert: "변환",
    navEarn: "수익",
    navActivity: "활동",
    navInsights: "인사이트",
    navSettings: "설정",
    navAnalytics: "애널리틱스",
    navSignOut: "로그아웃",
    backToWallet: "지갑으로 돌아가기",
    refresh: "새로고침",
    refreshing: "새로고침 중...",
    allTime: "전체 기간",
    allAccounts: "모든 계정",
    allAssets: "모든 자산",
    allNetworks: "모든 네트워크",
    settingsTitle: "설정",
    settingsLanguageLabel: "언어",
    settingsLanguageDesc: "FLOW 전체에서 사용할 표시 언어를 선택하세요.",
    settingsAppearanceLabel: "테마",
    settingsAppearanceDesc: "라이트 모드와 다크 모드를 전환합니다.",
    settingsSecurityTitle: "보안 및 인증",
    actionAddMoney: "입금",
    actionSend: "보내기",
    actionConvert: "변환",
    actionEarn: "수익",
    totalBalance: "총 잔액",
    insightsEyebrow: "개인 현금 흐름 및 성과",
    insightsTitle: "나의 FLOW 인사이트",
    insightsSubtitlePrefix: "메인넷 유입, 유출 및 잔액 추적 기간:",
    insightsSubtitleTo: "~",
    insightsTotalIn: "총 유입",
    insightsTotalOut: "총 유출",
    insightsCurrentBalance: "현재 잔액",
    insightsNetPeriodFlow: "기간 순흐름:",
    insightsHighestInMonth: "최대 유입 월",
    insightsHighestOutMonth: "최대 유출 월",
    insightsNoInflowsYet: "아직 유입 없음",
    insightsNoOutflowsYet: "아직 유출 없음",
    insightsPeakInHint: "입금 및 수령 내역이 쌓이면 최고 월이 표시됩니다.",
    insightsPeakOutHint: "송금 및 스왑 내역이 쌓이면 최고 월이 표시됩니다.",
    insightsChartTitle: "월별 현금 흐름 분석",
    insightsChartSubtitle: "월을 가리키거나 눌러 유입, 유출 및 자산별 내역을 확인하세요.",
    insightsModeFlow: "유입 vs 유출",
    insightsModeNet: "순 현금 흐름",
    insightsPeakInBadge: "최대 유입",
    insightsPeakOutBadge: "최대 유출",
    insightsAssetBreakdown: "자산별 내역",
    insightsNoActivityInMonth: "해당 월에 정산된 메인넷 유입/유출이 없습니다:",
    insightsTableTitle: "월별 요약",
    insightsColMonth: "월",
    insightsColInflow: "유입",
    insightsColOutflow: "유출",
    insightsColNet: "순액",
    insightsColTx: "건수",
    signInTitle: "FLOW 로그인",
    signInSubtitle: "간편해진 멀티체인 자산 관리.",
    signInWithGoogle: "Google로 계속하기",
    signInWithEmail: "이메일로 계속하기",
    signInSendCode: "인증 코드 보내기",
  },
  ar: {
    navHome: "الرئيسية",
    navSend: "إرسال",
    navConvert: "تحويل",
    navEarn: "عائد",
    navActivity: "النشاط",
    navInsights: "التحليلات",
    navSettings: "الإعدادات",
    navAnalytics: "إحصائيات المنصة",
    navSignOut: "تسجيل الخروج",
    backToWallet: "العودة إلى المحفظة",
    refresh: "تحديث",
    refreshing: "جارٍ التحديث...",
    allTime: "كل الوقت",
    allAccounts: "كل الحسابات",
    allAssets: "كل الأصول",
    allNetworks: "كل الشبكات",
    settingsTitle: "الإعدادات",
    settingsLanguageLabel: "اللغة",
    settingsLanguageDesc: "اختر لغة العرض المفضلة لديك في FLOW.",
    settingsAppearanceLabel: "مظهر التطبيق",
    settingsAppearanceDesc: "التبديل بين الوضع الفاتح والوضع الداكن.",
    settingsSecurityTitle: "الأمان والمصادقة",
    actionAddMoney: "إيداع",
    actionSend: "إرسال",
    actionConvert: "تحويل",
    actionEarn: "عائد",
    totalBalance: "إجمالي الرصيد",
    insightsEyebrow: "التدفق النقدي الشخصي والأداء",
    insightsTitle: "إحصائياتك في FLOW",
    insightsSubtitlePrefix: "تتبع التدفقات الداخلة والخارجة والرصيد على الشبكة الرئيسية من",
    insightsSubtitleTo: "إلى",
    insightsTotalIn: "إجمالي الوارد",
    insightsTotalOut: "إجمالي الصادر",
    insightsCurrentBalance: "الرصيد الحالي",
    insightsNetPeriodFlow: "صافي تدفق الفترة:",
    insightsHighestInMonth: "أعلى شهر في الوارد",
    insightsHighestOutMonth: "أعلى شهر في الصادر",
    insightsNoInflowsYet: "لا توجد واردات بعد",
    insightsNoOutflowsYet: "لا توجد صادرات بعد",
    insightsPeakInHint: "ستظهر الإيداعات والمدفوعات المستلمة شهر الذروة.",
    insightsPeakOutHint: "ستظهر التحويلات والمدفوعات المرسلة شهر الذروة.",
    insightsChartTitle: "تحليل التدفق النقدي الشهري",
    insightsChartSubtitle: "مرر أو اضغط على أي شهر لعرض الوارد والصادر وتفاصيل الأصول.",
    insightsModeFlow: "الوارد مقابل الصادر",
    insightsModeNet: "صافي التدفق",
    insightsPeakInBadge: "ذروة الوارد",
    insightsPeakOutBadge: "ذروة الصادر",
    insightsAssetBreakdown: "تفصيل الأصول",
    insightsNoActivityInMonth: "لا توجد حركات مؤكدة على الشبكة الرئيسية في",
    insightsTableTitle: "ملخص شهر بشهر",
    insightsColMonth: "الشهر",
    insightsColInflow: "الوارد",
    insightsColOutflow: "الصادر",
    insightsColNet: "الصافي",
    insightsColTx: "المعاملات",
    signInTitle: "تسجيل الدخول إلى FLOW",
    signInSubtitle: "إدارة الأموال عبر السلاسل ببساطة.",
    signInWithGoogle: "المتابعة باستخدام Google",
    signInWithEmail: "المتابعة بالبريد الإلكتروني",
    signInSendCode: "إرسال رمز التحقق",
  },
  de: {
    navHome: "Start",
    navSend: "Senden",
    navConvert: "Tauschen",
    navEarn: "Verdienen",
    navActivity: "Aktivität",
    navInsights: "Einblicke",
    navSettings: "Einstellungen",
    navAnalytics: "Analysen",
    navSignOut: "Abmelden",
    backToWallet: "Zurück zum Wallet",
    refresh: "Aktualisieren",
    refreshing: "Wird aktualisiert...",
    allTime: "Gesamter Zeitraum",
    allAccounts: "Alle Konten",
    allAssets: "Alle Assets",
    allNetworks: "Alle Netzwerke",
    settingsTitle: "Einstellungen",
    settingsLanguageLabel: "Sprache",
    settingsLanguageDesc: "Wähle deine bevorzugte Anzeigesprache in FLOW.",
    settingsAppearanceLabel: "Erscheinungsbild",
    settingsAppearanceDesc: "Zwischen hellem und dunklem Design wechseln.",
    settingsSecurityTitle: "Sicherheit & Authentifizierung",
    actionAddMoney: "Einzahlen",
    actionSend: "Senden",
    actionConvert: "Tauschen",
    actionEarn: "Verdienen",
    totalBalance: "Gesamtguthaben",
    insightsEyebrow: "Persönlicher Cashflow & Performance",
    insightsTitle: "Deine FLOW-Einblicke",
    insightsSubtitlePrefix: "Verfolgung deiner Mainnet-Zuflüsse, -Abflüsse und deines Guthabens von",
    insightsSubtitleTo: "bis",
    insightsTotalIn: "Gesamtzufluss",
    insightsTotalOut: "Gesamtabfluss",
    insightsCurrentBalance: "Aktuelles Guthaben",
    insightsNetPeriodFlow: "Netto-Periodenfluss:",
    insightsHighestInMonth: "Monat mit höchstem Zufluss",
    insightsHighestOutMonth: "Monat mit höchstem Abfluss",
    insightsNoInflowsYet: "Noch keine Zuflüsse",
    insightsNoOutflowsYet: "Noch keine Abflüsse",
    insightsPeakInHint: "Einzahlungen und erhaltene Zahlungen heben deinen Spitzenmonat hervor.",
    insightsPeakOutHint: "Sendungen und Swaps heben deinen Spitzenmonat hervor.",
    insightsChartTitle: "Monatliche Cashflow-Analyse",
    insightsChartSubtitle: "Fahre über einen Monat oder tippe darauf, um Zuflüsse, Abflüsse und Assets zu prüfen.",
    insightsModeFlow: "Zufluss vs Abfluss",
    insightsModeNet: "Netto-Cashflow",
    insightsPeakInBadge: "Spitzenzufluss",
    insightsPeakOutBadge: "Spitzenabfluss",
    insightsAssetBreakdown: "Asset-Aufschlüsselung",
    insightsNoActivityInMonth: "Keine abgerechneten Mainnet-Bewegungen erfasst in",
    insightsTableTitle: "Monatliche Zusammenfassung",
    insightsColMonth: "Monat",
    insightsColInflow: "Zufluss",
    insightsColOutflow: "Abfluss",
    insightsColNet: "Netto",
    insightsColTx: "Tx",
    signInTitle: "Bei FLOW anmelden",
    signInSubtitle: "Multi-Chain-Geld, einfach gemacht.",
    signInWithGoogle: "Mit Google fortfahren",
    signInWithEmail: "Mit E-Mail fortfahren",
    signInSendCode: "Bestätigungscode senden",
  },
};
