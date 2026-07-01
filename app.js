(function () {
  "use strict";

  var STORAGE_KEY = "local-ledger.records.v4";
  var BACKUP_KEY = "local-ledger.last-import-backup.v4";
  var PRESET_KEY = "local-ledger.last-preset.v2";
  var THEME_KEY = "local-ledger.theme.v1";
  var ASSET_VISIBILITY_KEY = "local-ledger.asset-visibility.v1";
  var FALLBACK_IMPORT_PROMPT = [
    "# Fiscell 账单转换 JSON 提示词",
    "",
    "你是 Fiscell v1.1.25 的账单数据转换助手。请把我提供的表格、CSV、文本、截图 OCR 文本或其他账单内容，转换成 Fiscell 可导入的 JSON。只输出 JSON，不要输出解释、Markdown 代码块或额外文字。",
    "",
    "输出 JSON：{\"app\":\"local-ledger\",\"version\":4,\"records\":[{\"id\":\"\",\"occurredAt\":\"2026-06-21T12:30:00+08:00\",\"kind\":\"income | expense | investment\",\"amount\":12.34,\"category\":\"分类\",\"project\":\"仅理财记录填写\",\"target\":\"仅理财记录填写二级分类或具体标的\",\"settlement\":\"none | pending\",\"settledAmount\":0,\"settledAt\":\"\",\"investmentProfit\":0,\"closedAt\":\"\",\"note\":\"备注\",\"tags\":[]}]}",
    "",
    "分类规则：支出优先为餐饮、交通、购物、学习、娱乐、医疗、生活、其他；收入优先为工资、其他；理财 category 只用买入或做空，project 为基金、股票、期货、外汇、数字货币、其他。",
    "理财 target 是随 project 变化的二级分类或具体标的：基金可用沪深300、中证500、纳斯达克100、标普500、黄金ETF、其他；股票可用 A股、港股、美股、ETF、其他；期货可用股指期货、商品期货、国债期货、其他；外汇可用美元、欧元、日元、港币、其他；数字货币可用 BTC、ETH、USDT、其他。",
    "理财操作金额表示资产内部转换，不改变总资产；investmentProfit 计入总资产，没有收益信息时填 0。",
    "只转换逐条账目；不要输出总金额、合计、余额、资产汇总、统计结果或 summary/total/balance 字段。金额必须为正数，不要输出 account。普通记录 settlement 为 none；预收入/预支出为 pending，部分结算只更新 settledAmount；完全结清后输出为普通 none 记录。"
  ].join("\n");

  var categoryDefaults = {
    expense: ["餐饮", "交通", "购物", "学习", "娱乐", "医疗", "生活", "其他"],
    income: ["工资", "其他"],
    investment: ["买入", "做空"]
  };
  var projectDefaults = ["基金", "股票", "期货", "外汇", "数字货币", "其他"];
  var targetDefaultsByProject = {
    "基金": ["沪深300", "中证500", "纳斯达克100", "标普500", "黄金ETF", "其他"],
    "股票": ["A股", "港股", "美股", "ETF", "其他"],
    "期货": ["股指期货", "商品期货", "国债期货", "其他"],
    "外汇": ["美元", "欧元", "日元", "港币", "其他"],
    "数字货币": ["BTC", "ETH", "USDT", "其他"],
    "其他": ["其他"]
  };
  var chartColors = ["#2468d8", "#d84a3a", "#1f9d70", "#7a5bd7", "#e28b22", "#188a9c", "#8b6b28", "#5f7085"];
  var SMART_CATEGORY_THRESHOLD = 0.8;
  var smartCategoryLexicons = {
    "餐饮": {
      "食堂": 1, "餐厅": 1, "饭店": 1, "餐费": 1, "饭费": 1, "用餐": 1, "就餐": 1, "堂食": 1, "外卖": 1, "美团外卖": 1, "饿了么": 1, "大众点评": 0.9,
      "早餐": 1, "早饭": 1, "午餐": 1, "午饭": 1, "晚餐": 1, "晚饭": 1, "宵夜": 1, "夜宵": 1, "快餐": 1, "小吃": 1, "盒饭": 1, "便当": 1,
      "汉堡": 1, "热狗": 1, "披萨": 1, "薯条": 1, "炸鸡": 1, "鸡排": 1, "鸡腿": 1, "鸡翅": 1, "烤鸡": 1, "烤鸭": 1, "牛肉": 0.9, "牛排": 1, "羊肉": 0.9,
      "火锅": 1, "麻辣烫": 1, "冒菜": 1, "串串": 1, "烧烤": 1, "烤肉": 1, "烤串": 1, "烤鱼": 1, "鱼粉": 1, "鱼丸": 1, "酸菜鱼": 1, "水煮鱼": 1,
      "小面": 1, "面馆": 1, "拉面": 1, "牛肉面": 1, "拌面": 1, "炒面": 1, "刀削面": 1, "重庆小面": 1, "热干面": 1, "米粉": 1, "米线": 1, "粉丝": 0.9, "酸辣粉": 1,
      "炒饭": 1, "盖饭": 1, "煲仔饭": 1, "黄焖鸡": 1, "麻辣香锅": 1, "沙县": 1, "兰州拉面": 1, "煎饼": 1, "煎饼果子": 1, "馅饼": 1, "肉夹馍": 1,
      "包子": 1, "小笼包": 1, "生煎": 1, "锅贴": 1, "饺子": 1, "馄饨": 1, "抄手": 1, "云吞": 1, "粥": 0.95, "豆浆": 1, "油条": 1, "烧麦": 1,
      "寿司": 1, "日料": 1, "韩餐": 1, "韩式": 0.9, "西餐": 1, "自助餐": 1, "料理": 0.9, "轻食": 1, "沙拉": 0.95, "三明治": 1,
      "奶茶": 1, "咖啡": 1, "茶饮": 1, "果茶": 1, "甜品": 1, "蛋糕": 1, "面包": 1, "烘焙": 1, "冰淇淋": 1, "雪糕": 1, "饮品": 0.9, "水果": 0.9, "果切": 1, "鲜果": 0.9,
      "肯德基": 1, "麦当劳": 1, "必胜客": 1, "德克士": 1, "汉堡王": 1, "塔斯汀": 1, "华莱士": 1, "达美乐": 1,
      "星巴克": 1, "瑞幸": 1, "库迪": 1, "Manner": 1, "Tims": 1, "Costa": 1,
      "喜茶": 1, "奈雪": 1, "蜜雪": 1, "蜜雪冰城": 1, "霸王茶姬": 1, "古茗": 1, "茶百道": 1, "一点点": 1, "沪上阿姨": 1, "CoCo": 1, "书亦烧仙草": 1, "益禾堂": 1, "快乐柠檬": 1,
      "海底捞": 1, "呷哺": 1, "凑凑": 1, "西贝": 1, "老乡鸡": 1, "乡村基": 1, "真功夫": 1, "吉野家": 1, "和府捞面": 1, "袁记云饺": 1, "遇见小面": 1, "杨国福": 1, "张亮麻辣烫": 1,
      "巴比": 1, "鲍师傅": 1, "85度C": 1, "好利来": 1, "巴黎贝甜": 1, "元祖": 1, "DQ": 1, "哈根达斯": 1
    },
    "交通": {
      "地铁": 1, "公交": 1, "打车": 1, "出租车": 1, "网约车": 1, "滴滴": 1, "高德打车": 1, "哈啰": 0.9, "单车": 1, "骑行": 0.95,
      "火车票": 1, "高铁": 1, "动车": 1, "机票": 1, "机场": 0.9, "停车": 0.85, "加油": 0.9, "高速": 0.9, "过路费": 1, "轨道交通": 1,
      "公交卡": 1, "交通卡": 1, "轮渡": 1, "车票": 0.9
    },
    "购物": {
      "淘宝": 1, "天猫": 1, "京东": 1, "拼多多": 1, "闲鱼": 1, "抖音商城": 1, "百货": 0.9, "超市": 0.9, "便利店": 0.9,
      "数码": 0.9, "电器": 0.9, "服饰": 0.9, "衣服": 0.9, "裤子": 0.9, "鞋": 0.85, "包": 0.85, "化妆品": 0.9, "护肤": 0.9,
      "日用品": 0.85, "文具": 0.85, "药妆": 0.9, "网购": 0.9, "零售": 0.85, "旗舰店": 0.9, "专卖店": 0.9, "商场": 0.9, "小卖部": 0.85
    },
    "学习": {
      "教育": 0.9, "课程": 0.9, "培训": 0.9, "学费": 1, "考试": 0.95, "教材": 1, "书籍": 0.9, "图书": 0.9, "论文": 0.9,
      "网课": 1, "课堂": 0.9, "学习": 0.85, "报名费": 0.9, "资料": 0.8, "文献": 0.9, "学校": 0.9, "学院": 0.9
    },
    "娱乐": {
      "游戏": 1, "Games": 1, "电影": 1, "影院": 1, "会员": 0.85, "音乐": 0.9, "视频": 0.85, "直播": 0.9, "App Store": 0.9, "Apple Music": 1,
      "Steam": 1, "米哈游": 1, "miHoYo": 1, "腾讯视频": 1, "爱奇艺": 1, "优酷": 1, "哔哩": 1, "B站": 1, "演出": 1, "门票": 0.9,
      "运动": 0.85, "健身": 0.9, "赛事": 0.9, "娱乐": 0.9, "文化休闲": 0.9
    },
    "医疗": {
      "医院": 1, "药房": 1, "药店": 1, "挂号": 1, "门诊": 1, "体检": 1, "医保": 1, "医疗": 0.95, "健康": 0.85,
      "诊疗": 1, "牙科": 1, "眼科": 1, "处方": 1, "药品": 1
    },
    "生活": {
      "话费": 1, "水费": 1, "电费": 1, "燃气": 1, "物业": 1, "房租": 1, "宽带": 1, "充值": 0.85, "缴费": 0.9,
      "生活服务": 0.9, "保险": 0.9, "理发": 0.95, "洗衣": 0.95, "维修": 0.9, "快递": 0.85, "家政": 0.95, "打印": 0.85, "证件": 0.85, "停车费": 0.85
    }
  };

  var state = {
    records: [],
    filters: {
      kind: "all",
      search: "",
      startDate: "",
      endDate: "",
      minAmount: "",
      maxAmount: "",
      primaryCategory: "",
      secondaryCategory: "",
      sortBy: "default",
      sortDir: "desc",
      pendingView: ""
    },
    lastPreset: {
      kind: "expense",
      category: "",
      project: "",
      target: ""
    },
    activeFormKind: "expense",
    formDrafts: createEmptyFormDrafts(),
    batch: {
      enabled: false,
      selectedIds: new Set()
    },
    pagination: {
      page: 1,
      pageSize: 20,
      totalPages: 1,
      totalRecords: 0
    },
    assetVisible: true,
    assetTrendMode: "asset",
    assetTrendRange: "30",
    importMode: "merge",
    pendingImport: null
  };
  mergeLexiconTerms(smartCategoryLexicons["餐饮"], {
    "土豆": 0.85, "番茄": 0.85, "西红柿": 0.85, "糕点": 1, "饼干": 1, "曲奇": 1, "蛋挞": 1, "蛋卷": 1, "泡芙": 1, "慕斯": 1, "布丁": 1, "巧克力": 1,
    "糖果": 0.95, "口香糖": 0.9, "饮料": 0.9, "可乐": 0.9, "雪碧": 0.9, "果汁": 0.9, "酸奶": 0.9, "牛奶": 0.85, "豆奶": 0.9, "椰汁": 0.9, "凉茶": 0.9, "矿泉水": 0.85,
    "苏打水": 0.9, "啤酒": 0.9, "红酒": 0.9, "白酒": 0.9, "鸡尾酒": 0.9, "米饭": 0.9, "白米饭": 1, "菜饭": 1, "蛋炒饭": 1, "卤肉饭": 1, "猪脚饭": 1, "烧腊饭": 1,
    "肥牛饭": 1, "咖喱饭": 1, "石锅拌饭": 1, "拌饭": 1, "便餐": 1, "套餐": 0.95, "单人餐": 1, "双人餐": 1, "点餐": 1, "加餐": 1, "订餐": 1, "团餐": 1,
    "餐饮": 1, "餐饮店": 1, "餐饮服务": 1, "餐馆": 1, "菜馆": 1, "小馆": 0.9, "大排档": 1, "美食": 0.95, "餐吧": 1, "酒楼": 1, "茶餐厅": 1, "粤菜": 1,
    "川菜": 1, "湘菜": 1, "鲁菜": 1, "淮扬菜": 1, "东北菜": 1, "江浙菜": 1, "本帮菜": 1, "新疆菜": 1, "清真": 0.85, "烧腊": 1, "卤味": 1, "卤菜": 1,
    "熟食": 0.95, "烧鹅": 1, "叉烧": 1, "烤肠": 1, "香肠": 0.9, "火腿": 0.85, "培根": 0.9, "猪肉": 0.85, "排骨": 0.9, "五花肉": 0.9, "肉丸": 0.9, "鸭脖": 1,
    "鸭腿": 1, "鸭翅": 1, "鸭货": 1, "鹅肉": 0.9, "鱼香肉丝": 1, "宫保鸡丁": 1, "回锅肉": 1, "红烧肉": 1, "水煮肉": 1, "酸辣土豆丝": 1, "土豆粉": 1, "土豆泥": 0.95,
    "番茄炒蛋": 1, "西红柿炒蛋": 1, "蛋花汤": 1, "汤": 0.8, "粥铺": 1, "汤包": 1, "馒头": 0.95, "花卷": 0.95, "烧饼": 1, "手抓饼": 1, "葱油饼": 1, "鸡蛋灌饼": 1,
    "铁板烧": 1, "砂锅": 1, "砂锅粉": 1, "砂锅粥": 1, "螺蛳粉": 1, "桂林米粉": 1, "过桥米线": 1, "河粉": 1, "肠粉": 1, "粿条": 1, "粉面": 0.95, "炸酱面": 1,
    "油泼面": 1, "臊子面": 1, "米皮": 1, "凉皮": 1, "凉面": 1, "担担面": 1, "宜宾燃面": 1, "关东煮": 1, "章鱼烧": 1, "炸串": 1, "炸物": 0.9, "炸薯": 1,
    "薯饼": 1, "鸡米花": 1, "鸡块": 1, "鸡柳": 1, "鸡爪": 1, "鸡胸": 0.85, "鸡肉卷": 1, "墨西哥卷": 1, "卷饼": 1, "塔可": 1, "烤冷面": 1
  });

  var els = {};
  var toastTimer = null;
  var resizeTimer = null;
  var assetTrendRenderState = null;
  var assetTrendDrag = null;
  var smartClassifyJob = {
    records: [],
    sourceRecords: [],
    running: false
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    applyTheme(localStorage.getItem(THEME_KEY) || "light");
    state.assetVisible = localStorage.getItem(ASSET_VISIBILITY_KEY) !== "hidden";
    state.lastPreset = loadPreset();
    state.records = loadRecords();
    bindEvents();
    resetForm({ keepPreset: true });
    state.activeFormKind = getSelectedKind();
    render();
  }

  function cacheElements() {
    els.entryForm = document.getElementById("entryForm");
    els.recordId = document.getElementById("recordId");
    els.formTitle = document.getElementById("formTitle");
    els.amount = document.getElementById("amount");
    els.profitField = document.getElementById("profitField");
    els.investmentProfit = document.getElementById("investmentProfit");
    els.investmentActionField = document.getElementById("investmentActionField");
    els.projectField = document.getElementById("projectField");
    els.investmentProject = document.getElementById("investmentProject");
    els.targetField = document.getElementById("targetField");
    els.investmentTarget = document.getElementById("investmentTarget");
    els.category = document.getElementById("category");
    els.categoryLabel = document.getElementById("categoryLabel");
    els.pendingBox = document.getElementById("pendingBox");
    els.pendingToggle = document.getElementById("pendingToggle");
    els.pendingLabel = document.getElementById("pendingLabel");
    els.occurredAt = document.getElementById("occurredAt");
    els.useCurrentTime = document.getElementById("useCurrentTime");
    els.note = document.getElementById("note");
    els.tags = document.getElementById("tags");
    els.submitBtn = document.getElementById("submitBtn");
    els.resetFormBtn = document.getElementById("resetFormBtn");
    els.kindFilter = document.getElementById("kindFilter");
    els.searchInput = document.getElementById("searchInput");
    els.moreFiltersBtn = document.getElementById("moreFiltersBtn");
    els.advancedFilters = document.getElementById("advancedFilters");
    els.startDateFilter = document.getElementById("startDateFilter");
    els.endDateFilter = document.getElementById("endDateFilter");
    els.minAmountFilter = document.getElementById("minAmountFilter");
    els.maxAmountFilter = document.getElementById("maxAmountFilter");
    els.primaryCategoryFilter = document.getElementById("primaryCategoryFilter");
    els.secondaryCategoryFilter = document.getElementById("secondaryCategoryFilter");
    els.clearAllBtn = document.getElementById("clearAllBtn");
    els.importBtn = document.getElementById("importBtn");
    els.importMenu = document.getElementById("importMenu");
    els.importReplaceBtn = document.getElementById("importReplaceBtn");
    els.importMergeBtn = document.getElementById("importMergeBtn");
    els.importGuideBtn = document.getElementById("importGuideBtn");
    els.exportBtn = document.getElementById("exportBtn");
    els.exportMenu = document.getElementById("exportMenu");
    els.exportJsonBtn = document.getElementById("exportJsonBtn");
    els.exportCsvBtn = document.getElementById("exportCsvBtn");
    els.setAssetBtn = document.getElementById("setAssetBtn");
    els.assetVisibilityBtn = document.getElementById("assetVisibilityBtn");
    els.themeToggle = document.getElementById("themeToggle");
    els.themeIconSun = document.getElementById("themeIconSun");
    els.themeIconMoon = document.getElementById("themeIconMoon");
    els.importFile = document.getElementById("importFile");
    els.totalAssetsCard = document.getElementById("totalAssetsCard");
    els.totalAssets = document.getElementById("totalAssets");
    els.pendingIncome = document.getElementById("pendingIncome");
    els.pendingDebt = document.getElementById("pendingDebt");
    els.expectedAssets = document.getElementById("expectedAssets");
    els.flexibleAssets = document.getElementById("flexibleAssets");
    els.pendingIncomeCard = document.getElementById("pendingIncomeCard");
    els.pendingDebtCard = document.getElementById("pendingDebtCard");
    els.pendingBanner = document.getElementById("pendingBanner");
    els.pendingBannerText = document.getElementById("pendingBannerText");
    els.clearPendingViewBtn = document.getElementById("clearPendingViewBtn");
    els.visibleCount = document.getElementById("visibleCount");
    els.smartClassifyBtn = document.getElementById("smartClassifyBtn");
    els.amountSortBtn = document.getElementById("amountSortBtn");
    els.timeSortBtn = document.getElementById("timeSortBtn");
    els.batchTools = document.getElementById("batchTools");
    els.batchToggleBtn = document.getElementById("batchToggleBtn");
    els.selectAllBtn = document.getElementById("selectAllBtn");
    els.clearSelectionBtn = document.getElementById("clearSelectionBtn");
    els.deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
    els.batchCategoryBtn = document.getElementById("batchCategoryBtn");
    els.batchCategoryMenu = document.getElementById("batchCategoryMenu");
    els.batchCategoryInput = document.getElementById("batchCategoryInput");
    els.batchCategoryOptions = document.getElementById("batchCategoryOptions");
    els.applyBatchCategoryBtn = document.getElementById("applyBatchCategoryBtn");
    els.exportSelectedBtn = document.getElementById("exportSelectedBtn");
    els.batchExportMenu = document.getElementById("batchExportMenu");
    els.exportSelectedJsonBtn = document.getElementById("exportSelectedJsonBtn");
    els.exportSelectedCsvBtn = document.getElementById("exportSelectedCsvBtn");
    els.pageSizeSelect = document.getElementById("pageSizeSelect");
    els.firstPageBtn = document.getElementById("firstPageBtn");
    els.prevPageBtn = document.getElementById("prevPageBtn");
    els.pageInput = document.getElementById("pageInput");
    els.pageTotalText = document.getElementById("pageTotalText");
    els.nextPageBtn = document.getElementById("nextPageBtn");
    els.lastPageBtn = document.getElementById("lastPageBtn");
    els.recordsBody = document.getElementById("recordsBody");
    els.emptyState = document.getElementById("emptyState");
    els.incomeChart = document.getElementById("incomeChart");
    els.expenseChart = document.getElementById("expenseChart");
    els.assetTrendChart = document.getElementById("assetTrendChart");
    els.assetTrendMode = document.getElementById("assetTrendMode");
    els.assetTrendRange = document.getElementById("assetTrendRange");
    els.assetTrendHint = document.getElementById("assetTrendHint");
    els.assetTrendTooltip = document.getElementById("assetTrendTooltip");
    els.clearDateFilterBtn = document.getElementById("clearDateFilterBtn");
    els.incomeHint = document.getElementById("incomeHint");
    els.expenseHint = document.getElementById("expenseHint");
    els.chartDrawer = document.getElementById("chartDrawer");
    els.chartDrawerTitle = document.getElementById("chartDrawerTitle");
    els.chartDrawerBody = document.getElementById("chartDrawerBody");
    els.categoryOptions = document.getElementById("categoryOptions");
    els.projectOptions = document.getElementById("projectOptions");
    els.targetOptions = document.getElementById("targetOptions");
    els.primaryCategoryOptions = document.getElementById("primaryCategoryOptions");
    els.secondaryCategoryOptions = document.getElementById("secondaryCategoryOptions");
    els.toast = document.getElementById("toast");
    els.importGuideOverlay = document.getElementById("importGuideOverlay");
    els.importGuideCloseBtn = document.getElementById("importGuideCloseBtn");
    els.importGuideCopyPromptBtn = document.getElementById("importGuideCopyPromptBtn");
    els.importPreviewOverlay = document.getElementById("importPreviewOverlay");
    els.importPreviewBody = document.getElementById("importPreviewBody");
    els.importPreviewCancelBtn = document.getElementById("importPreviewCancelBtn");
    els.importPreviewConfirmBtn = document.getElementById("importPreviewConfirmBtn");
    els.actionMenu = document.getElementById("actionMenu");
    els.smartClassifyOverlay = document.getElementById("smartClassifyOverlay");
    els.smartClassifyMessage = document.getElementById("smartClassifyMessage");
    els.smartClassifyProgressWrap = document.getElementById("smartClassifyProgressWrap");
    els.smartClassifyProgressBar = document.getElementById("smartClassifyProgressBar");
    els.smartClassifyProgressText = document.getElementById("smartClassifyProgressText");
    els.smartClassifyOnlyOther = document.getElementById("smartClassifyOnlyOther");
    els.smartClassifyActions = document.getElementById("smartClassifyActions");
    els.smartClassifyCancelBtn = document.getElementById("smartClassifyCancelBtn");
    els.smartClassifyConfirmBtn = document.getElementById("smartClassifyConfirmBtn");
  }

  function bindEvents() {
    els.entryForm.addEventListener("submit", handleSubmit);
    els.themeToggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
      renderCharts();
    });
    els.resetFormBtn.addEventListener("click", function () {
      resetForm({ keepPreset: false });
    });
    document.querySelectorAll("input[name='kind']").forEach(function (node) {
      node.addEventListener("change", function () {
        saveFormDraft(state.activeFormKind);
        state.activeFormKind = getSelectedKind();
        restoreFormDraft(state.activeFormKind);
        updateFormForKind({ keepCategory: true });
        fillDatalists();
      });
    });
    els.useCurrentTime.addEventListener("change", function () {
      els.occurredAt.disabled = els.useCurrentTime.checked;
      if (els.useCurrentTime.checked) {
        setNow();
      }
    });
    els.kindFilter.addEventListener("change", function () {
      leaveBatchMode();
      state.filters.kind = els.kindFilter.value;
      state.filters.pendingView = "";
      state.pagination.page = 1;
      resetCategoryFilterLevels();
      refreshAdvancedFilterOptions();
      render();
    });
    els.searchInput.addEventListener("input", function () {
      leaveBatchMode();
      state.filters.search = els.searchInput.value.trim().toLowerCase();
      state.pagination.page = 1;
      render();
    });
    els.moreFiltersBtn.addEventListener("click", toggleAdvancedFilters);
    els.startDateFilter.addEventListener("change", function () {
      leaveBatchMode();
      state.filters.startDate = els.startDateFilter.value;
      state.filters.pendingView = "";
      state.pagination.page = 1;
      render();
    });
    els.endDateFilter.addEventListener("change", function () {
      leaveBatchMode();
      state.filters.endDate = els.endDateFilter.value;
      state.filters.pendingView = "";
      state.pagination.page = 1;
      render();
    });
    els.minAmountFilter.addEventListener("input", function () {
      leaveBatchMode();
      state.filters.minAmount = els.minAmountFilter.value;
      state.filters.pendingView = "";
      state.pagination.page = 1;
      render();
    });
    els.maxAmountFilter.addEventListener("input", function () {
      leaveBatchMode();
      state.filters.maxAmount = els.maxAmountFilter.value;
      state.filters.pendingView = "";
      state.pagination.page = 1;
      render();
    });
    els.primaryCategoryFilter.addEventListener("input", function () {
      leaveBatchMode();
      state.filters.primaryCategory = cleanText(els.primaryCategoryFilter.value);
      state.filters.secondaryCategory = "";
      els.secondaryCategoryFilter.value = "";
      state.filters.pendingView = "";
      state.pagination.page = 1;
      refreshAdvancedFilterOptions();
      renderOpenComboMenu("primaryCategoryFilter");
      render();
    });
    els.secondaryCategoryFilter.addEventListener("input", function () {
      leaveBatchMode();
      state.filters.secondaryCategory = cleanText(els.secondaryCategoryFilter.value);
      state.filters.pendingView = "";
      state.pagination.page = 1;
      renderOpenComboMenu("secondaryCategoryFilter");
      render();
    });
    els.amountSortBtn.addEventListener("click", function () {
      cycleTableSort("amount");
    });
    els.timeSortBtn.addEventListener("click", function () {
      cycleTableSort("time");
    });
    els.totalAssetsCard.addEventListener("click", resetViewFilters);
    els.pendingIncomeCard.addEventListener("click", function () {
      togglePendingView("income");
    });
    els.pendingDebtCard.addEventListener("click", function () {
      togglePendingView("expense");
    });
    els.clearPendingViewBtn.addEventListener("click", resetViewFilters);
    els.smartClassifyBtn.addEventListener("click", smartClassifyFilteredRecords);
    els.smartClassifyOnlyOther.addEventListener("change", updateSmartClassifyPreview);
    els.smartClassifyCancelBtn.addEventListener("click", closeSmartClassifyDialog);
    els.smartClassifyConfirmBtn.addEventListener("click", runSmartClassifyJob);
    els.setAssetBtn.addEventListener("click", setCurrentAsset);
    els.assetVisibilityBtn.addEventListener("click", toggleAssetVisibility);
    els.clearAllBtn.addEventListener("click", clearAll);
    els.importBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleHeaderMenu("import");
    });
    els.importReplaceBtn.addEventListener("click", function () {
      beginImport("replace");
    });
    els.importMergeBtn.addEventListener("click", function () {
      beginImport("merge");
    });
    els.importGuideBtn.addEventListener("click", openImportGuide);
    els.exportBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleHeaderMenu("export");
    });
    els.importGuideCloseBtn.addEventListener("click", closeImportGuide);
    els.importGuideCopyPromptBtn.addEventListener("click", copyImportPrompt);
    els.importGuideOverlay.addEventListener("click", function (event) {
      if (event.target === els.importGuideOverlay) {
        closeImportGuide();
      }
    });
    els.importPreviewCancelBtn.addEventListener("click", closeImportPreview);
    els.importPreviewConfirmBtn.addEventListener("click", confirmImportPreview);
    els.importPreviewOverlay.addEventListener("click", function (event) {
      if (event.target === els.importPreviewOverlay) {
        closeImportPreview();
      }
    });
    els.exportJsonBtn.addEventListener("click", function () {
      closeHeaderMenus();
      exportJson();
    });
    els.exportCsvBtn.addEventListener("click", function () {
      closeHeaderMenus();
      exportCsv();
    });
    els.importFile.addEventListener("change", importFile);
    els.recordsBody.addEventListener("click", handleTableAction);
    els.recordsBody.addEventListener("change", handleBatchSelectionChange);
    els.recordsBody.addEventListener("dblclick", handleTableDoubleClick);
    els.batchToggleBtn.addEventListener("click", toggleBatchMode);
    els.selectAllBtn.addEventListener("click", selectAllVisibleRecords);
    els.clearSelectionBtn.addEventListener("click", clearBatchSelection);
    els.deleteSelectedBtn.addEventListener("click", deleteSelectedRecords);
    els.batchCategoryBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleBatchCategoryMenu();
    });
    els.applyBatchCategoryBtn.addEventListener("click", applyBatchCategory);
    els.batchCategoryInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        applyBatchCategory();
      }
    });
    els.exportSelectedBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleBatchExportMenu();
    });
    els.exportSelectedJsonBtn.addEventListener("click", function () {
      closeBatchExportMenu();
      exportSelectedRecords("json");
    });
    els.exportSelectedCsvBtn.addEventListener("click", function () {
      closeBatchExportMenu();
      exportSelectedRecords("csv");
    });
    els.pageSizeSelect.addEventListener("change", function () {
      state.pagination.pageSize = Number(els.pageSizeSelect.value) || 20;
      state.pagination.page = 1;
      render();
    });
    els.firstPageBtn.addEventListener("click", function () {
      setPage(1);
    });
    els.prevPageBtn.addEventListener("click", function () {
      setPage(state.pagination.page - 1);
    });
    els.nextPageBtn.addEventListener("click", function () {
      setPage(state.pagination.page + 1);
    });
    els.lastPageBtn.addEventListener("click", function () {
      setPage(state.pagination.totalPages);
    });
    els.pageInput.addEventListener("change", function () {
      setPage(parseInt(els.pageInput.value, 10));
    });
    els.pageInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        setPage(parseInt(els.pageInput.value, 10));
      }
    });
    els.assetTrendRange.addEventListener("change", function () {
      state.assetTrendRange = els.assetTrendRange.value || "30";
      drawAssetTrendChart();
    });
    els.assetTrendMode.addEventListener("change", function () {
      state.assetTrendMode = els.assetTrendMode.value || "asset";
      drawAssetTrendChart();
    });
    els.assetTrendChart.addEventListener("mousemove", handleAssetTrendHover);
    els.assetTrendChart.addEventListener("mouseleave", hideAssetTrendTooltip);
    els.assetTrendChart.addEventListener("mousedown", beginAssetTrendDrag);
    els.assetTrendChart.addEventListener("mouseup", finishAssetTrendDrag);
    document.addEventListener("mouseup", function (event) {
      if (assetTrendDrag) {
        finishAssetTrendDrag(event);
      }
    });
    els.clearDateFilterBtn.addEventListener("click", clearDateFilter);
    els.actionMenu.addEventListener("click", handleActionMenuClick);
    document.querySelectorAll(".combo-button").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openComboMenu(button.getAttribute("data-combo-for"));
      });
    });
    document.querySelectorAll(".combo-field input").forEach(function (input) {
      input.addEventListener("input", function () {
        renderOpenComboMenu(input.id);
      });
    });
    document.querySelectorAll("[data-chart-detail]").forEach(function (box) {
      box.addEventListener("click", function () {
        openChartDrawer(box.getAttribute("data-chart-detail"));
      });
    });
    els.chartDrawerBody.addEventListener("click", handleChartDrawerClick);
    els.investmentProject.addEventListener("input", fillDatalists);
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".combo-field")) {
        closeComboMenus();
      }
      if (!event.target.closest(".stats-panel")) {
        closeChartDrawer();
      }
      if (!event.target.closest(".action-menu") && !event.target.closest("button[data-action='more']")) {
        closeActionMenu();
      }
      if (!event.target.closest(".header-menu-wrap")) {
        closeHeaderMenus();
      }
      if (!event.target.closest(".batch-menu-wrap")) {
        closeBatchExportMenu();
        closeBatchCategoryMenu();
      }
    });
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderCharts, 120);
    });

    setInterval(function () {
      if (els.useCurrentTime.checked && !els.recordId.value) {
        setNow();
      }
    }, 30000);
  }

  function loadRecords() {
    var records = readStorageArray(STORAGE_KEY);
    return records.map(normalizeStoredRecord).filter(Boolean);
  }

  function readStorageArray(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      showToast("读取本地数据失败，已使用空账本。");
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  }

  function loadPreset() {
    try {
      var raw = localStorage.getItem(PRESET_KEY);
      if (!raw) {
        return { kind: "expense", category: "", project: "", target: "" };
      }
      var parsed = JSON.parse(raw);
      return {
        kind: "expense",
        category: "",
        project: "",
        target: ""
      };
    } catch (error) {
      return { kind: "expense", category: "", project: "", target: "" };
    }
  }

  function savePreset(preset) {
    state.lastPreset = {
      kind: preset.kind,
      category: cleanText(preset.category),
      project: cleanText(preset.project),
      target: cleanText(preset.target)
    };
    localStorage.setItem(PRESET_KEY, JSON.stringify(state.lastPreset));
  }

  function createEmptyFormDrafts() {
    return {
      expense: createEmptyFormDraft(),
      income: createEmptyFormDraft(),
      investment: createEmptyFormDraft()
    };
  }

  function createEmptyFormDraft() {
    return {
      amount: "",
      category: "",
      investmentProfit: "",
      investmentAction: "买入",
      project: "",
      target: "",
      pending: false,
      useCurrentTime: true,
      occurredAt: "",
      note: "",
      tags: ""
    };
  }

  function saveFormDraft(kind) {
    var normalized = normalizeKind(kind);
    if (!normalized || !state.formDrafts || !state.formDrafts[normalized]) {
      return;
    }
    state.formDrafts[normalized] = {
      amount: els.amount.value,
      category: els.category.value,
      investmentProfit: els.investmentProfit.value,
      investmentAction: getSelectedInvestmentAction(),
      project: els.investmentProject.value,
      target: els.investmentTarget.value,
      pending: els.pendingToggle.checked,
      useCurrentTime: els.useCurrentTime.checked,
      occurredAt: els.occurredAt.value,
      note: els.note.value,
      tags: els.tags.value
    };
  }

  function restoreFormDraft(kind) {
    var normalized = normalizeKind(kind) || "expense";
    var draft = (state.formDrafts && state.formDrafts[normalized]) || createEmptyFormDraft();
    els.amount.value = draft.amount || "";
    els.category.value = draft.category || "";
    els.investmentProfit.value = draft.investmentProfit || "";
    setSelectedInvestmentAction(draft.investmentAction || "买入");
    els.investmentProject.value = draft.project || "";
    els.investmentTarget.value = draft.target || "";
    els.pendingToggle.checked = Boolean(draft.pending);
    els.useCurrentTime.checked = draft.useCurrentTime !== false;
    els.occurredAt.disabled = els.useCurrentTime.checked;
    if (els.useCurrentTime.checked) {
      setNow();
    } else {
      els.occurredAt.value = draft.occurredAt || "";
    }
    els.note.value = draft.note || "";
    els.tags.value = draft.tags || "";
  }

  function handleSubmit(event) {
    event.preventDefault();
    leaveBatchMode();
    var submitNowIso = new Date().toISOString();
    if (els.useCurrentTime.checked) {
      setNow(submitNowIso);
    }

    var nowIso = submitNowIso;
    var kind = getSelectedKind();
    var amount = roundMoney(parseMoney(els.amount.value));
    var categoryInput = cleanText(els.category.value);
    var investmentProfit = kind === "investment" ? roundMoney(parseMoney(els.investmentProfit.value)) : 0;

    if (kind !== "investment" && amount <= 0) {
      showToast("收入或支出的金额需要大于 0。");
      return;
    }
    if (kind === "investment" && amount <= 0 && investmentProfit === 0) {
      showToast("理财记录需要填写操作金额或收益。");
      return;
    }

    var pending = kind !== "investment" && els.pendingToggle.checked;
    var record = {
      id: els.recordId.value || createId(),
      kind: kind,
      amount: amount,
      category: kind === "investment" ? getSelectedInvestmentAction() : (categoryInput || "其他"),
      project: kind === "investment" ? cleanText(els.investmentProject.value) : "",
      target: kind === "investment" ? cleanText(els.investmentTarget.value) : "",
      settlement: pending ? "pending" : "none",
      settledAmount: 0,
      settlementEvents: [],
      settledAt: "",
      investmentProfit: investmentProfit,
      closedAt: "",
      occurredAt: els.useCurrentTime.checked ? nowIso : localDateTimeToIso(els.occurredAt.value),
      note: cleanText(els.note.value),
      tags: splitTags(els.tags.value),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (!record.occurredAt) {
      showToast("请选择有效时间。");
      return;
    }

    var existingIndex = state.records.findIndex(function (item) {
      return item.id === record.id;
    });
    if (existingIndex >= 0) {
      var existing = state.records[existingIndex];
      record.createdAt = existing.createdAt || nowIso;
      if (existing.kind === "investment" && record.kind === "investment") {
        record.closedAt = existing.closedAt || "";
      }
      if (existing.settlement === "pending" && record.kind !== "investment") {
        record.settlement = "pending";
      }
      record.settledAmount = record.settlement === "pending" ? clampMoney(existing.settledAmount || 0, 0, record.amount) : 0;
      record.settlementEvents = record.settlement === "pending" ? (existing.settlementEvents || []) : [];
      record.settledAt = record.settlement === "pending" && record.settledAmount >= record.amount ? (existing.settledAt || nowIso) : "";
      state.records[existingIndex] = record;
      showToast("记录已更新。");
    } else {
      state.records.push(record);
      showToast("记录已保存，并保留了本次预设。");
    }

    saveRecords();
    savePreset({ kind: record.kind, category: record.kind === "investment" ? record.category : categoryInput, project: record.project, target: record.target });
    resetForm({ keepPreset: true });
    render();
  }

  function handleTableAction(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    var id = button.getAttribute("data-id");
    var action = button.getAttribute("data-action");
    if (action === "more") {
      var menuRecord = findRecord(id);
      if (!menuRecord) {
        closeActionMenu();
        return;
      }
      openActionMenu(button, id);
      return;
    }
    var record = findRecord(id);
    if (!record) {
      return;
    }

    if (action === "edit") {
      leaveBatchMode();
      editRecord(record);
    }
    if (action === "copy") {
      leaveBatchMode();
      copyRecord(record);
    }
    if (action === "delete" && window.confirm("确定删除这条记录吗？")) {
      leaveBatchMode();
      state.records = state.records.filter(function (item) {
        return item.id !== id;
      });
      saveRecords();
      render();
      showToast("记录已删除。");
    }
    if (action === "settle-partial") {
      leaveBatchMode();
      var row = button.closest("tr");
      var input = row ? row.querySelector("input[data-settle-input]") : null;
      settleRecord(record, parseMoney(input ? input.value : 0));
    }
    if (action === "fill-settle-full") {
      var fullRow = button.closest("tr");
      var fullInput = fullRow ? fullRow.querySelector("input[data-settle-input]") : null;
      if (fullInput) {
        fullInput.value = getRemainingAmount(record);
        fullInput.focus();
      }
    }
    if (action === "close-investment") {
      leaveBatchMode();
      closeInvestment(record);
    }
  }

  function handleTableDoubleClick(event) {
    if (event.target.closest("button, input, select, textarea, a")) {
      return;
    }
    var row = event.target.closest("tr[data-row-id]");
    if (!row) {
      return;
    }
    var record = findRecord(row.getAttribute("data-row-id"));
    if (record) {
      leaveBatchMode();
      editRecord(record);
    }
  }

  function handleActionMenuClick(event) {
    var button = event.target.closest("button[data-menu-action]");
    if (!button) {
      return;
    }
    var id = els.actionMenu.getAttribute("data-record-id");
    var record = findRecord(id);
    if (!record) {
      closeActionMenu();
      return;
    }
    var action = button.getAttribute("data-menu-action");
    closeActionMenu();
    if (action === "edit") {
      leaveBatchMode();
      editRecord(record);
    }
    if (action === "copy") {
      leaveBatchMode();
      copyRecord(record);
    }
    if (action === "close-investment") {
      leaveBatchMode();
      closeInvestment(record);
    }
  }

  function openActionMenu(button, id) {
    if (!els.actionMenu.classList.contains("hidden") && els.actionMenu.getAttribute("data-record-id") === id) {
      closeActionMenu();
      return;
    }
    var rect = button.getBoundingClientRect();
    var record = findRecord(id);
    els.actionMenu.innerHTML = buildActionMenu(record);
    els.actionMenu.setAttribute("data-record-id", id);
    els.actionMenu.style.top = Math.round(rect.bottom + 4) + "px";
    els.actionMenu.style.left = Math.round(Math.max(8, Math.min(rect.right - 86, window.innerWidth - 96))) + "px";
    els.actionMenu.classList.remove("hidden");
  }

  function buildActionMenu(record) {
    var items = [
      "<button type=\"button\" data-menu-action=\"copy\">复制</button>",
      "<button type=\"button\" data-menu-action=\"edit\">编辑</button>"
    ];
    if (record && record.kind === "investment" && !record.closedAt) {
      items.push("<button type=\"button\" data-menu-action=\"close-investment\">平仓</button>");
    }
    return items.join("");
  }

  function closeActionMenu() {
    if (els.actionMenu) {
      els.actionMenu.classList.add("hidden");
      els.actionMenu.removeAttribute("data-record-id");
    }
  }

  function toggleHeaderMenu(kind) {
    var isImport = kind === "import";
    var menu = isImport ? els.importMenu : els.exportMenu;
    var button = isImport ? els.importBtn : els.exportBtn;
    var willOpen = menu.classList.contains("hidden");
    closeHeaderMenus();
    if (willOpen) {
      menu.classList.remove("hidden");
      button.setAttribute("aria-expanded", "true");
    }
  }

  function closeHeaderMenus() {
    if (els.importMenu) {
      els.importMenu.classList.add("hidden");
      els.importBtn.setAttribute("aria-expanded", "false");
    }
    if (els.exportMenu) {
      els.exportMenu.classList.add("hidden");
      els.exportBtn.setAttribute("aria-expanded", "false");
    }
  }

  function openImportGuide() {
    closeHeaderMenus();
    els.importGuideOverlay.classList.remove("hidden");
    els.importGuideOverlay.setAttribute("aria-hidden", "false");
  }

  function closeImportGuide() {
    els.importGuideOverlay.classList.add("hidden");
    els.importGuideOverlay.setAttribute("aria-hidden", "true");
  }

  function openImportPreview() {
    renderImportPreview();
    els.importPreviewOverlay.classList.remove("hidden");
    els.importPreviewOverlay.setAttribute("aria-hidden", "false");
  }

  function closeImportPreview() {
    state.pendingImport = null;
    els.importPreviewOverlay.classList.add("hidden");
    els.importPreviewOverlay.setAttribute("aria-hidden", "true");
    els.importPreviewBody.innerHTML = "";
  }

  function beginImport(mode) {
    state.importMode = mode;
    closeHeaderMenus();
    els.importFile.value = "";
    els.importFile.click();
  }

  function copyRecord(record) {
    leaveBatchMode();
    var clone = Object.assign({}, record, {
      id: createId(),
      settledAmount: 0,
      settlementEvents: [],
      settledAt: "",
      closedAt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    state.records.push(clone);
    saveRecords();
    render();
    showToast("已复制一条记录。");
  }

  function settleRecord(record, amount) {
    leaveBatchMode();
    var remaining = getRemainingAmount(record);
    var value = clampMoney(roundMoney(amount), 0, remaining);
    if (value <= 0) {
      showToast("请输入大于 0 且不超过剩余金额的结算金额。");
      return;
    }
    var nowIso = new Date().toISOString();
    var nextSettledAmount = roundMoney((record.settledAmount || 0) + value);
    record.settlementEvents = record.settlementEvents || [];
    record.settlementEvents.push({ amount: value, at: nowIso });
    record.settledAmount = nextSettledAmount;
    if (nextSettledAmount >= record.amount) {
      record.settlement = "none";
      record.settledAmount = 0;
      record.settlementEvents = [];
      record.settledAt = nowIso;
    } else {
      record.settledAt = "";
    }
    record.updatedAt = nowIso;
    saveRecords();
    render();
    showToast("已结算 " + formatMoney(value) + "。");
  }

  function closeInvestment(record) {
    leaveBatchMode();
    if (!record || record.kind !== "investment" || record.closedAt) {
      return;
    }
    var nowIso = new Date().toISOString();
    record.closedAt = nowIso;
    record.updatedAt = nowIso;
    saveRecords();
    render();
    showToast("理财记录已平仓。");
  }

  function findRecord(id) {
    return state.records.find(function (item) {
      return item.id === id;
    });
  }

  function editRecord(record) {
    leaveBatchMode();
    els.recordId.value = record.id;
    setSelectedKind(record.kind);
    state.activeFormKind = record.kind;
    updateFormForKind({ keepCategory: true });
    els.amount.value = record.amount || "";
    els.investmentProfit.value = record.investmentProfit || "";
    els.investmentProject.value = record.project || "";
    els.investmentTarget.value = record.target || "";
    setSelectedInvestmentAction(record.category);
    els.category.value = record.category || "";
    els.pendingToggle.checked = record.settlement === "pending";
    els.occurredAt.value = isoToLocalInput(record.occurredAt);
    els.useCurrentTime.checked = false;
    els.occurredAt.disabled = false;
    els.note.value = record.note || "";
    els.tags.value = (record.tags || []).join(", ");
    els.formTitle.textContent = "编辑记录";
    els.submitBtn.textContent = "更新记录";
    fillDatalists();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm(options) {
    var keepPreset = options && options.keepPreset;
    var preset = keepPreset ? state.lastPreset : { kind: "expense", category: "", project: "", target: "" };
    state.formDrafts = createEmptyFormDrafts();
    els.entryForm.reset();
    els.recordId.value = "";
    setSelectedKind(preset.kind);
    state.activeFormKind = preset.kind;
    els.amount.value = "";
    els.investmentProfit.value = "";
    setSelectedInvestmentAction("买入");
    els.investmentProject.value = preset.project || "";
    els.investmentTarget.value = preset.target || "";
    els.category.value = preset.category || "";
    els.pendingToggle.checked = false;
    els.useCurrentTime.checked = true;
    setNow();
    els.formTitle.textContent = "添加一笔";
    els.submitBtn.textContent = "保存记录";
    updateFormForKind({ keepCategory: true });
    saveFormDraft(getSelectedKind());
    fillDatalists();
  }

  function updateFormForKind(options) {
    var keepCategory = options && options.keepCategory;
    var kind = getSelectedKind();
    els.investmentActionField.classList.toggle("hidden", kind !== "investment");
    els.profitField.classList.toggle("hidden", kind !== "investment");
    els.projectField.classList.toggle("hidden", kind !== "investment");
    els.targetField.classList.toggle("hidden", kind !== "investment");
    els.pendingBox.classList.toggle("hidden", kind === "investment");
    els.categoryLabel.textContent = "分类";
    var categoryField = els.category.closest(".field");
    if (categoryField) {
      categoryField.classList.toggle("hidden", kind === "investment");
    }
    els.category.required = false;
    els.amount.placeholder = "0.00";
    els.pendingLabel.textContent = kind === "income" ? "标记为预收入" : "标记为预支出";

    if (!keepCategory) {
      els.category.value = "";
      els.investmentProject.value = "";
      els.investmentTarget.value = "";
    }
    if (kind === "investment") {
      els.pendingToggle.checked = false;
    }
  }

  function render() {
    var filteredRecords = getFilteredRecords();
    var pageRecords = getPagedRecords(filteredRecords);
    pruneBatchSelection();
    renderSummary();
    renderPendingBanner();
    renderTable(pageRecords);
    renderBatchControls(pageRecords, filteredRecords.length);
    renderPagination(filteredRecords.length);
    renderDateFilterControls();
    renderSortButtons();
    renderCharts();
    refreshChartDrawer();
    fillDatalists();
    refreshAdvancedFilterOptions();
  }

  function getAssetSummary() {
    var totalAssets = 0;
    var investmentAssets = 0;
    var preIncome = 0;
    var preExpense = 0;
    state.records.forEach(function (record) {
      if (record.kind === "investment") {
        if (!record.closedAt) {
          investmentAssets += record.amount;
        }
        totalAssets += Number(record.investmentProfit) || 0;
        return;
      }
      var realized = getRealizedAmount(record);
      totalAssets += record.kind === "income" ? realized : -realized;
      if (record.settlement === "pending") {
        var remaining = getRemainingAmount(record);
        if (record.kind === "income") {
          preIncome += remaining;
        } else {
          preExpense += remaining;
        }
      }
    });
    return {
      totalAssets: roundMoney(totalAssets),
      investmentAssets: roundMoney(investmentAssets),
      preIncome: roundMoney(preIncome),
      preExpense: roundMoney(preExpense),
      expectedAssets: roundMoney(totalAssets + preIncome - preExpense),
      flexibleAssets: roundMoney(totalAssets - investmentAssets)
    };
  }

  function renderSummary() {
    var summary = getAssetSummary();
    els.totalAssets.textContent = privateMoney(summary.totalAssets);
    els.pendingIncome.textContent = privateMoney(summary.preIncome);
    els.pendingDebt.textContent = privateMoney(summary.preExpense);
    els.expectedAssets.textContent = privateMoney(summary.expectedAssets);
    els.flexibleAssets.textContent = privateMoney(summary.flexibleAssets);
    els.assetVisibilityBtn.setAttribute("aria-pressed", String(!state.assetVisible));
    els.assetVisibilityBtn.setAttribute("title", state.assetVisible ? "隐藏资产数字" : "显示资产数字");
    els.assetVisibilityBtn.setAttribute("aria-label", state.assetVisible ? "隐藏资产数字" : "显示资产数字");
    els.assetVisibilityBtn.querySelector(".icon-eye").classList.toggle("hidden", !state.assetVisible);
    els.assetVisibilityBtn.querySelector(".icon-eye-off").classList.toggle("hidden", state.assetVisible);
    els.totalAssetsCard.classList.toggle("active", !state.filters.pendingView && state.filters.kind === "all" && !state.filters.search && !state.filters.startDate && !state.filters.endDate && !state.filters.minAmount && !state.filters.maxAmount && !state.filters.primaryCategory && !state.filters.secondaryCategory);
    els.pendingIncomeCard.classList.toggle("active", state.filters.pendingView === "income");
    els.pendingDebtCard.classList.toggle("active", state.filters.pendingView === "expense");
  }

  function renderPendingBanner() {
    if (!state.filters.pendingView) {
      els.pendingBanner.classList.add("hidden");
      els.pendingBannerText.textContent = "";
      return;
    }
    var label = state.filters.pendingView === "income" ? "预收入" : "预支出";
    var count = getPendingRecords(state.filters.pendingView).length;
    els.pendingBannerText.textContent = "正在查看 " + label + " 条目，共 " + count + " 条，可在金额列输入本次结算金额。";
    els.pendingBanner.classList.remove("hidden");
  }

  function renderTable(records) {
    els.recordsBody.innerHTML = "";
    els.emptyState.classList.toggle("show", records.length === 0);
    els.visibleCount.textContent = "共 " + records.length + " 条";
    document.querySelectorAll(".select-col").forEach(function (cell) {
      cell.classList.toggle("hidden", !state.batch.enabled);
    });

    var fragment = document.createDocumentFragment();
    records.forEach(function (record) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-row-id", record.id);
      tr.classList.toggle("selected-row", state.batch.selectedIds.has(record.id));
      var checked = state.batch.selectedIds.has(record.id) ? " checked" : "";
      var selectCell = state.batch.enabled
        ? "<td class=\"select-col\"><input class=\"row-select\" type=\"checkbox\" data-select-id=\"" + escapeHtml(record.id) + "\"" + checked + " aria-label=\"选择这条记录\"></td>"
        : "<td class=\"select-col hidden\"></td>";
      tr.innerHTML =
        selectCell +
        "<td><span class=\"badge " + record.kind + "\">" + kindLabel(record.kind) + "</span></td>" +
        "<td>" + renderCategoryCell(record) + "</td>" +
        "<td class=\"amount " + record.kind + "\">" + renderAmount(record) + "</td>" +
        "<td class=\"status-col\">" + renderStatus(record) + "</td>" +
        "<td>" + escapeHtml(record.note || "") + "</td>" +
        "<td class=\"time-col\">" + renderTimeCell(record.occurredAt) + "</td>" +
        "<td><div class=\"row-actions\">" +
        "<button class=\"icon-action delete-action\" type=\"button\" data-action=\"delete\" data-id=\"" + escapeHtml(record.id) + "\" title=\"删除\" aria-label=\"删除\">×</button>" +
        "<button class=\"icon-action\" type=\"button\" data-action=\"more\" data-id=\"" + escapeHtml(record.id) + "\" title=\"更多\" aria-label=\"更多\">⋮</button>" +
        "</div></td>";
      fragment.appendChild(tr);
    });
    els.recordsBody.appendChild(fragment);
  }

  function renderCategoryCell(record) {
    if (record.kind === "investment") {
      var detail = [record.project, record.target].map(cleanText).filter(Boolean).join(" - ");
      var detailText = detail ? "<div class=\"hint investment-path\">" + escapeHtml(detail) + "</div>" : "";
      return escapeHtml(normalizeInvestmentAction(record.category)) + detailText + renderTags(record.tags);
    }
    return escapeHtml(record.category) + renderTags(record.tags);
  }

  function renderAmount(record) {
    if (record.kind === "investment") {
      var profit = Number(record.investmentProfit) || 0;
      var profitText = profit ? "<div class=\"hint\">收益 " + signedMoney(profit) + "</div>" : "";
      return formatMoney(record.amount) + profitText;
    }
    var value = (record.kind === "income" ? "+" : "-") + formatMoney(record.amount);
    if (record.settlement !== "pending" || getRemainingAmount(record) <= 0) {
      return value;
    }
    return "<div class=\"amount-stack\">" +
      "<strong>" + value + "</strong>" +
      "<div class=\"settle-amount-row\">" +
      "<input data-settle-input=\"" + escapeHtml(record.id) + "\" type=\"number\" min=\"0.01\" step=\"0.01\" placeholder=\"本次结算\">" +
      "</div>" +
      "</div>";
  }

  function renderStatus(record) {
    if (record.kind === "investment") {
      if (record.closedAt) {
        return "<div class=\"status-stack\">" +
          "<span class=\"badge investment\">已平仓</span>" +
          "<span class=\"hint\">" + escapeHtml(formatDateTime(record.closedAt)) + "</span>" +
          "</div>";
      }
      return "<div class=\"status-stack\">" +
        "<span class=\"badge investment\">理财</span>" +
        "</div>";
    }
    if (record.settlement !== "pending") {
      return "<span class=\"hint\">普通</span>";
    }
    var remaining = getRemainingAmount(record);
    var label = record.kind === "income" ? "预收入" : "预支出";
    if (remaining <= 0) {
      return "<div class=\"status-stack\">" +
        "<span class=\"badge " + record.kind + "\">" + label + "已结清</span>" +
        (record.settledAt ? "<span class=\"hint\">" + escapeHtml(formatDateTime(record.settledAt)) + "</span>" : "") +
        "</div>";
    }
    return "<div class=\"status-stack\">" +
      "<div class=\"settle-status-line\">" +
      "<span class=\"badge settlement-badge " + record.kind + "\"><strong>" + label + "</strong><span>已结算 " + formatMoney(record.settledAmount || 0) + "</span></span>" +
      "</div>" +
      "<div class=\"settle-action-row\">" +
      "<button type=\"button\" data-action=\"fill-settle-full\" data-id=\"" + escapeHtml(record.id) + "\">全部</button>" +
      "<button class=\"settle-submit\" type=\"button\" data-action=\"settle-partial\" data-id=\"" + escapeHtml(record.id) + "\">结算</button>" +
      "</div>" +
      "</div>";
  }

  function renderTags(tags) {
    if (!tags || !tags.length) {
      return "";
    }
    var text = tags.map(cleanText).filter(Boolean).join(" / ");
    return text ? "<div class=\"hint tag-line\" title=\"" + escapeHtml(text) + "\">" + escapeHtml(text) + "</div>" : "";
  }

  function renderTimeCell(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "<div class=\"time-split\"><span class=\"time-date\"></span><span class=\"time-clock\"></span></div>";
    }
    var dateText = date.getFullYear() + "/" + pad2(date.getMonth() + 1) + "/" + pad2(date.getDate());
    var timeText = pad2(date.getHours()) + ":" + pad2(date.getMinutes());
    return "<div class=\"time-split\"><span class=\"time-date\">" + dateText + "</span><span class=\"time-clock\">" + timeText + "</span></div>";
  }

  function getFilteredRecords() {
    var startTs = dateFilterStart(state.filters.startDate);
    var endTs = dateFilterEnd(state.filters.endDate);
    var minAmount = parseOptionalMoney(state.filters.minAmount);
    var maxAmount = parseOptionalMoney(state.filters.maxAmount);
    return state.records
      .filter(function (record) {
        if (state.filters.pendingView) {
          return record.kind === state.filters.pendingView && record.settlement === "pending" && getRemainingAmount(record) > 0;
        }
        if (state.filters.kind !== "all" && record.kind !== state.filters.kind) {
          return false;
        }
        var recordTs = new Date(record.occurredAt).getTime();
        if (startTs && recordTs < startTs) {
          return false;
        }
        if (endTs && recordTs > endTs) {
          return false;
        }
        var amount = Math.abs(Number(record.amount) || 0);
        if (minAmount != null && amount < minAmount) {
          return false;
        }
        if (maxAmount != null && amount > maxAmount) {
          return false;
        }
        if (state.filters.primaryCategory) {
          if (!startsWithText(getPrimaryFilterValue(record), state.filters.primaryCategory)) {
            return false;
          }
        }
        if (state.filters.secondaryCategory) {
          if (!startsWithText(getSecondaryFilterValue(record), state.filters.secondaryCategory)) {
            return false;
          }
        }
        if (state.filters.search) {
          var haystack = buildSearchText(record);
          return haystack.indexOf(state.filters.search) >= 0;
        }
        return true;
      })
      .sort(compareRecordsForView);
  }

  function compareRecordsForView(a, b) {
    var sortBy = state.filters.sortBy || "default";
    var sortDir = state.filters.sortDir === "asc" ? "asc" : "desc";
    if (sortBy === "amount") {
      return compareNumber(a.amount, b.amount, sortDir) || compareTimeDesc(a, b);
    }
    if (sortBy === "time") {
      return sortDir === "asc" ? compareTimeAsc(a, b) : compareTimeDesc(a, b);
    }
    return compareTimeDesc(a, b);
  }

  function compareTimeAsc(a, b) {
    return getRecordTime(a) - getRecordTime(b);
  }

  function compareTimeDesc(a, b) {
    return getRecordTime(b) - getRecordTime(a);
  }

  function compareNumber(a, b, direction) {
    var result = (Number(a) || 0) - (Number(b) || 0);
    return direction === "asc" ? result : -result;
  }

  function cycleTableSort(field) {
    leaveBatchMode();
    if (state.filters.sortBy !== field) {
      state.filters.sortBy = field;
      state.filters.sortDir = field === "amount" ? "desc" : "asc";
    } else if (field === "amount" && state.filters.sortDir === "desc") {
      state.filters.sortDir = "asc";
    } else if (field === "time" && state.filters.sortDir === "asc") {
      state.filters.sortDir = "desc";
    } else {
      state.filters.sortBy = "default";
      state.filters.sortDir = "desc";
    }
    state.pagination.page = 1;
    render();
  }

  function renderSortButtons() {
    updateSortButton(els.amountSortBtn, "amount", "金额");
    updateSortButton(els.timeSortBtn, "time", "时间");
  }

  function updateSortButton(button, field, label) {
    var active = state.filters.sortBy === field;
    var direction = active ? state.filters.sortDir : "";
    var symbol = active ? (direction === "asc" ? "↑" : "↓") : "↕";
    var text = active ? (direction === "asc" ? "升序" : "降序") : "默认";
    button.textContent = symbol;
    button.classList.toggle("active", active);
    button.setAttribute("aria-label", label + "排序：" + text);
    button.setAttribute("title", label + "排序：" + text);
  }

  function getRecordTime(record) {
    return new Date(record.occurredAt).getTime() || 0;
  }

  function buildSearchText(record) {
    return [
      record.category,
      record.project,
      record.target,
      record.note,
      record.settlement === "pending" ? (record.kind === "income" ? "预收入" : "预支出") : "",
      (record.tags || []).join(" ")
    ].join(" ").toLowerCase();
  }

  function getPrimaryFilterValue(record) {
    return record.kind === "investment" ? cleanText(record.project) : cleanText(record.category);
  }

  function getSecondaryFilterValue(record) {
    return record.kind === "investment" ? cleanText(record.target) : "";
  }

  function startsWithText(value, prefix) {
    return cleanText(value).toLowerCase().indexOf(cleanText(prefix).toLowerCase()) === 0;
  }

  function smartClassifyFilteredRecords() {
    if (smartClassifyJob.running) {
      return;
    }
    leaveBatchMode();
    var records = getFilteredRecords().filter(function (record) {
      return record.kind === "income" || record.kind === "expense";
    });
    if (!records.length) {
      showToast("当前筛选结果没有可归类的收入或支出条目。");
      return;
    }

    smartClassifyJob.sourceRecords = records;
    els.smartClassifyOnlyOther.checked = true;
    els.smartClassifyProgressWrap.classList.add("hidden");
    els.smartClassifyActions.classList.remove("hidden");
    els.smartClassifyProgressBar.style.width = "0%";
    els.smartClassifyOverlay.classList.remove("hidden");
    els.smartClassifyOverlay.setAttribute("aria-hidden", "false");
    updateSmartClassifyPreview();
  }

  function closeSmartClassifyDialog() {
    if (smartClassifyJob.running) {
      return;
    }
    smartClassifyJob.records = [];
    smartClassifyJob.sourceRecords = [];
    els.smartClassifyOverlay.classList.add("hidden");
    els.smartClassifyOverlay.setAttribute("aria-hidden", "true");
  }

  function runSmartClassifyJob() {
    if (smartClassifyJob.running) {
      return;
    }
    smartClassifyJob.records = getSmartClassifyTargetRecords();
    if (!smartClassifyJob.records.length) {
      showToast("没有符合条件的其他分类条目。");
      return;
    }
    smartClassifyJob.running = true;
    els.smartClassifyActions.classList.add("hidden");
    els.smartClassifyProgressWrap.classList.remove("hidden");
    els.smartClassifyMessage.textContent = "正在智能归类，请等待完成。";
    setSmartClassifyProgress(0, smartClassifyJob.records.length);
    processSmartClassifyChunk(0, 0, 0);
  }

  function processSmartClassifyChunk(startIndex, changed, otherCount) {
    var records = smartClassifyJob.records;
    var total = records.length;
    var nowIso = new Date().toISOString();
    var endIndex = Math.min(startIndex + 50, total);
    for (var index = startIndex; index < endIndex; index += 1) {
      var record = records[index];
      var nextCategory = classifyRecordByLexicon(record);
      if (nextCategory === "其他") {
        otherCount += 1;
      }
      if (record.category !== nextCategory) {
        record.category = nextCategory;
        record.updatedAt = nowIso;
        changed += 1;
      }
    }

    setSmartClassifyProgress(endIndex, total);
    if (endIndex < total) {
      window.setTimeout(function () {
        processSmartClassifyChunk(endIndex, changed, otherCount);
      }, 20);
      return;
    }

    finishSmartClassifyJob(changed, otherCount);
  }

  function finishSmartClassifyJob(changed, otherCount) {
    smartClassifyJob.running = false;
    smartClassifyJob.records = [];
    smartClassifyJob.sourceRecords = [];
    if (changed) {
      saveRecords();
      fillDatalists();
      refreshAdvancedFilterOptions();
      render();
    }
    closeSmartClassifyDialog();
    if (!changed) {
      showToast("智能归类完成，没有需要修改的分类。");
      return;
    }
    showToast("智能归类完成：更新 " + changed + " 条，归为其他 " + otherCount + " 条。");
  }

  function setSmartClassifyProgress(done, total) {
    var percent = total ? Math.round((done / total) * 100) : 0;
    els.smartClassifyProgressBar.style.width = percent + "%";
    els.smartClassifyProgressText.textContent = done + " / " + total;
  }

  function updateSmartClassifyPreview() {
    var targets = getSmartClassifyTargetRecords();
    var onlyOther = els.smartClassifyOnlyOther.checked;
    var suffix = onlyOther ? "（仅其他分类）" : "";
    els.smartClassifyMessage.textContent = "你将会对 " + targets.length + " 条账目进行智能分类" + suffix + "，不保证精准性。确认后开始分类。";
    els.smartClassifyProgressText.textContent = "0 / " + targets.length;
    els.smartClassifyConfirmBtn.disabled = targets.length === 0;
  }

  function getSmartClassifyTargetRecords() {
    var records = smartClassifyJob.sourceRecords || [];
    if (!els.smartClassifyOnlyOther.checked) {
      return records.slice();
    }
    return records.filter(function (record) {
      return cleanText(record.category) === "其他";
    });
  }

  function mergeLexiconTerms(target, additions) {
    Object.keys(additions).forEach(function (keyword) {
      target[keyword] = additions[keyword];
    });
  }

  function classifyRecordByLexicon(record) {
    if (record.kind === "income") {
      return scoreTextForCategory(buildClassificationText(record), {
        "工资": { "工资": 1, "薪资": 1, "薪水": 1, "劳务": 0.9, "奖金": 0.9, "绩效": 0.9 },
        "其他": {}
      }, "其他");
    }
    return scoreTextForCategory(buildClassificationText(record), smartCategoryLexicons, "其他");
  }

  function buildClassificationText(record) {
    return [
      record.category,
      record.project,
      record.target,
      record.note,
      (record.tags || []).join(" ")
    ].join(" ").toLowerCase();
  }

  function scoreTextForCategory(text, lexicons, fallback) {
    var bestCategory = fallback;
    var bestScore = 0;
    var tied = false;
    Object.keys(lexicons).forEach(function (category) {
      var score = 0;
      Object.keys(lexicons[category]).forEach(function (keyword) {
        if (text.indexOf(String(keyword).toLowerCase()) >= 0) {
          score += Number(lexicons[category][keyword]) || 0;
        }
      });
      score = Math.min(1, score);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
        tied = false;
      } else if (score > 0 && score === bestScore) {
        tied = true;
      }
    });
    return bestScore >= SMART_CATEGORY_THRESHOLD && !tied ? bestCategory : fallback;
  }

  function getPagedRecords(records) {
    var total = records.length;
    var pageSize = state.pagination.pageSize || 20;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    state.pagination.totalRecords = total;
    state.pagination.totalPages = totalPages;
    state.pagination.page = clampInteger(state.pagination.page, 1, totalPages);
    var start = (state.pagination.page - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }

  function renderPagination(totalRecords) {
    var page = state.pagination.page;
    var totalPages = state.pagination.totalPages;
    els.pageSizeSelect.value = String(state.pagination.pageSize);
    els.pageInput.value = String(page);
    els.pageInput.max = String(totalPages);
    els.pageTotalText.textContent = "/ " + totalPages + " 页";
    var disabled = totalRecords === 0;
    els.firstPageBtn.disabled = disabled || page <= 1;
    els.prevPageBtn.disabled = disabled || page <= 1;
    els.nextPageBtn.disabled = disabled || page >= totalPages;
    els.lastPageBtn.disabled = disabled || page >= totalPages;
    els.pageInput.disabled = disabled;
  }

  function setPage(page) {
    var next = clampInteger(page, 1, state.pagination.totalPages || 1);
    if (next === state.pagination.page) {
      renderPagination(state.pagination.totalRecords || 0);
      return;
    }
    state.pagination.page = next;
    render();
  }

  function clampInteger(value, min, max) {
    var number = parseInt(value, 10);
    if (!Number.isFinite(number)) {
      number = min;
    }
    return Math.min(max, Math.max(min, number));
  }

  function dateFilterStart(value) {
    if (!value) {
      return null;
    }
    var ts = new Date(value + "T00:00:00").getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  function dateFilterEnd(value) {
    if (!value) {
      return null;
    }
    var ts = new Date(value + "T23:59:59.999").getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  function renderCharts() {
    drawStructureChart(els.incomeChart, "income", els.incomeHint);
    drawStructureChart(els.expenseChart, "expense", els.expenseHint);
    drawAssetTrendChart();
  }

  function drawStructureChart(canvas, kind, hintEl) {
    var ctx = setupCanvas(canvas);
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    var entries = getStructureEntries(kind);
    var total = entries.reduce(function (sum, item) { return sum + item.value; }, 0);
    hintEl.textContent = total ? privateMoney(total) : "";

    if (!total) {
      drawEmptyChart(ctx, width, height, kind === "income" ? "暂无已结算收入" : "暂无已结算支出");
      return;
    }

    var cx = width / 2;
    var cy = height / 2 + 4;
    var radius = Math.min(58, height * 0.33, width * 0.33);
    var start = -Math.PI / 2;
    entries.forEach(function (item, index) {
      var angle = item.value / total * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = chartColors[index % chartColors.length];
      ctx.fill();
      start += angle;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = cssVar("--panel");
    ctx.fill();
    ctx.fillStyle = cssVar("--ink");
    ctx.font = "700 13px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(kind === "income" ? "收入" : "支出", cx, cy);
  }

  function drawAssetTrendChart(hoverPoint, dragRange) {
    if (!els.assetTrendChart) {
      return;
    }
    var ctx = setupCanvas(els.assetTrendChart);
    var width = els.assetTrendChart.clientWidth;
    var height = els.assetTrendChart.clientHeight;
    ctx.clearRect(0, 0, width, height);

    var data = getAssetTrendChartData(state.assetTrendMode, state.assetTrendRange);
    var points = sampleTrendPoints(data.points, 256);
    data.points = points;
    if (!points.length || !data.series.length) {
      els.assetTrendHint.textContent = "";
      assetTrendRenderState = null;
      drawEmptyChart(ctx, width, height, data.emptyText);
      return;
    }
    els.assetTrendHint.textContent = data.hint;

    var padLeft = 54;
    var padRight = 16;
    var padTop = 18;
    var padBottom = 42;
    var plotW = Math.max(1, width - padLeft - padRight);
    var plotH = Math.max(1, height - padTop - padBottom);
    var minTs = points[0].ts;
    var maxTs = points[points.length - 1].ts;
    if (maxTs <= minTs) {
      maxTs = minTs + 86400000;
    }
    var values = getTrendYValues(data);
    var minValue = Math.min.apply(null, values);
    var maxValue = Math.max.apply(null, values);
    if (data.startsAtZero) {
      minValue = 0;
    }
    if (maxValue === minValue) {
      maxValue += 1;
      minValue -= 1;
    }
    var valuePad = (maxValue - minValue) * 0.08;
    minValue -= valuePad;
    maxValue += valuePad;

    function xOf(ts) {
      return padLeft + (ts - minTs) / (maxTs - minTs) * plotW;
    }
    function yOf(value) {
      return padTop + (maxValue - value) / (maxValue - minValue) * plotH;
    }

    var selectedRange = dragRange || getVisibleDateSelectionRange(minTs, maxTs);
    if (selectedRange) {
      var selectedLeft = xOf(Math.max(minTs, selectedRange.start));
      var selectedRight = xOf(Math.min(maxTs, selectedRange.end));
      ctx.fillStyle = "rgba(31, 157, 112, 0.14)";
      ctx.fillRect(Math.min(selectedLeft, selectedRight), padTop, Math.abs(selectedRight - selectedLeft), plotH);
    }

    ctx.strokeStyle = cssVar("--line");
    ctx.lineWidth = 1;
    ctx.fillStyle = cssVar("--muted");
    ctx.font = "11px Microsoft YaHei, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var i = 0; i <= 4; i += 1) {
      var ratio = i / 4;
      var y = padTop + ratio * plotH;
      var value = maxValue - ratio * (maxValue - minValue);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(state.assetVisible ? shortMoney(Math.max(0, value)) : "****", padLeft - 8, y);
    }

    drawTrendTimeTicks(ctx, minTs, maxTs, xOf, padTop, height - padBottom, height);

    if (data.series.length === 1) {
      drawSingleTrendArea(ctx, points, xOf, yOf, height - padBottom);
    }
    data.series.forEach(function (series, index) {
      drawTrendLine(ctx, points, series, xOf, yOf, index);
    });

    if (hoverPoint) {
      var hoverX = xOf(hoverPoint.ts);
      var hoverY = yOf(getTrendPointValue(hoverPoint, data.series[0]));
      ctx.save();
      ctx.strokeStyle = "rgba(36, 104, 216, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoverX, padTop);
      ctx.lineTo(hoverX, height - padBottom);
      ctx.stroke();
      drawTrendHoverMarkers(ctx, hoverPoint, data.series, xOf, yOf);
      ctx.restore();
    }

    var last = points[points.length - 1];
    drawTrendHoverMarkers(ctx, last, data.series.slice(0, 1), xOf, yOf, 3);
    assetTrendRenderState = {
      points: points,
      data: data,
      padLeft: padLeft,
      padRight: padRight,
      padTop: padTop,
      padBottom: padBottom,
      plotW: plotW,
      plotH: plotH,
      minTs: minTs,
      maxTs: maxTs,
      minValue: minValue,
      maxValue: maxValue
    };
  }

  function getAssetTrendChartData(mode, range) {
    if (mode === "daily") {
      var dailyPoints = getDailyAverageTrendPoints(getAssetTrendPoints(range));
      return {
        mode: mode,
        points: dailyPoints,
        series: [{ name: "日均资产", color: "#2468d8" }],
        hint: dailyPoints.length ? "日均 " + privateMoney(dailyPoints[dailyPoints.length - 1].value) : "",
        emptyText: "暂无资产变化数据",
        startsAtZero: false
      };
    }
    if (mode === "income" || mode === "expense") {
      return getFlowStructureTrendData(mode, range);
    }
    var assetPoints = getAssetTrendPoints(range);
    return {
      mode: "asset",
      points: assetPoints,
      series: [{ name: "总资产", color: "#2468d8" }],
      hint: assetPoints.length ? "当前 " + privateMoney(assetPoints[assetPoints.length - 1].value) : "",
      emptyText: "暂无资产变化数据",
      startsAtZero: false
    };
  }

  function getDailyAverageTrendPoints(points) {
    if (!points.length) {
      return [];
    }
    var result = [];
    var count = 0;
    var index = 0;
    var currentValue = Number(points[0].value) || 0;
    var cursor = startOfDay(new Date(points[0].ts)).getTime();
    var end = startOfDay(new Date(points[points.length - 1].ts)).getTime();
    for (var guard = 0; cursor <= end && guard < 40000; guard += 1) {
      var dayEnd = cursor + 86400000 - 1;
      while (index + 1 < points.length && points[index + 1].ts <= dayEnd) {
        index += 1;
        currentValue = Number(points[index].value) || 0;
      }
      count += 1;
      result.push({ ts: cursor, value: roundMoney(currentValue / count) });
      cursor += 86400000;
    }
    return result;
  }

  function getFlowStructureTrendData(kind, range) {
    var events = getFlowTrendEvents(kind);
    var emptyText = kind === "income" ? "暂无收入结构数据" : "暂无支出结构数据";
    if (!events.length) {
      return { mode: kind, points: [], series: [], hint: "", emptyText: emptyText, startsAtZero: true };
    }
    var now = Date.now();
    var all = range === "all";
    var startTs = all ? events[0].ts : now - Number(range || 30) * 86400000;
    var visibleEvents = events.filter(function (event) {
      return event.ts >= startTs && event.ts <= now;
    });
    var totals = {};
    visibleEvents.forEach(function (event) {
      totals[event.category] = roundMoney((totals[event.category] || 0) + event.amount);
    });
    var total = Object.keys(totals).reduce(function (sum, key) { return sum + totals[key]; }, 0);
    if (!total) {
      return { mode: kind, points: [], series: [], hint: "", emptyText: emptyText, startsAtZero: true };
    }
    var categories = Object.keys(totals)
      .filter(function (key) { return totals[key] / total >= 0.01; })
      .sort(function (a, b) { return totals[b] - totals[a]; });
    if (!categories.length) {
      return { mode: kind, points: [], series: [], hint: "", emptyText: emptyText, startsAtZero: true };
    }
    var selected = new Set(categories);
    var values = {};
    categories.forEach(function (category) {
      values[category] = 0;
    });
    var points = [{ ts: startTs, values: Object.assign({}, values), value: 0 }];
    visibleEvents.forEach(function (event) {
      if (!selected.has(event.category)) {
        return;
      }
      values[event.category] = roundMoney((values[event.category] || 0) + event.amount);
      points.push({ ts: event.ts, values: Object.assign({}, values), value: sumSelectedValues(values, categories) });
    });
    points.push({ ts: all ? Math.max(now, events[events.length - 1].ts) : now, values: Object.assign({}, values), value: sumSelectedValues(values, categories) });
    points = compactSeriesTrendPoints(points);
    var series = categories.map(function (category, index) {
      return {
        name: category,
        color: chartColors[index % chartColors.length]
      };
    });
    var lastValue = points.length ? points[points.length - 1].value : 0;
    return {
      mode: kind,
      points: points,
      series: series,
      hint: (kind === "income" ? "累计收入 " : "累计支出 ") + privateMoney(lastValue),
      emptyText: emptyText,
      startsAtZero: true
    };
  }

  function getFlowTrendEvents(kind) {
    var events = [];
    state.records.forEach(function (record) {
      if (record.kind === "investment") {
        var profit = Number(record.investmentProfit) || 0;
        if ((kind === "income" && profit > 0) || (kind === "expense" && profit < 0)) {
          addFlowTrendEvent(events, record.occurredAt, "理财", Math.abs(profit));
        }
        return;
      }
      if (record.kind !== kind) {
        return;
      }
      var category = cleanText(record.category) || "其他";
      if (record.settlement === "pending") {
        if (Array.isArray(record.settlementEvents) && record.settlementEvents.length) {
          record.settlementEvents.forEach(function (event) {
            addFlowTrendEvent(events, event.at || record.occurredAt, category, Number(event.amount) || 0);
          });
          return;
        }
        if (Number(record.settledAmount) > 0) {
          addFlowTrendEvent(events, record.settledAt || record.occurredAt, category, Number(record.settledAmount));
        }
        return;
      }
      addFlowTrendEvent(events, record.occurredAt, category, Number(record.amount) || 0);
    });
    return events
      .filter(function (event) { return Number.isFinite(event.ts) && event.amount > 0; })
      .sort(function (a, b) { return a.ts - b.ts; });
  }

  function addFlowTrendEvent(events, iso, category, amount) {
    var ts = new Date(iso).getTime();
    if (Number.isFinite(ts) && amount > 0) {
      events.push({ ts: ts, category: category, amount: roundMoney(amount) });
    }
  }

  function compactSeriesTrendPoints(points) {
    var byDay = new Map();
    points.forEach(function (point) {
      var key = new Date(point.ts).toISOString().slice(0, 10);
      byDay.set(key, point);
    });
    return Array.from(byDay.values()).sort(function (a, b) { return a.ts - b.ts; });
  }

  function sumSelectedValues(values, categories) {
    return roundMoney(categories.reduce(function (sum, category) {
      return sum + (Number(values[category]) || 0);
    }, 0));
  }

  function getTrendYValues(data) {
    var values = [];
    data.points.forEach(function (point) {
      data.series.forEach(function (series) {
        values.push(getTrendPointValue(point, series));
      });
    });
    if (data.startsAtZero) {
      values.push(0);
    }
    return values;
  }

  function getTrendPointValue(point, series) {
    if (point.values) {
      return Number(point.values[series.name]) || 0;
    }
    return Number(point.value) || 0;
  }

  function drawSingleTrendArea(ctx, points, xOf, yOf, baseY) {
    var areaGradient = ctx.createLinearGradient(0, 0, 0, baseY);
    areaGradient.addColorStop(0, "rgba(36, 104, 216, 0.24)");
    areaGradient.addColorStop(0.58, "rgba(36, 104, 216, 0.08)");
    areaGradient.addColorStop(1, "rgba(36, 104, 216, 0)");
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xOf(point.ts);
      var y = yOf(point.value);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(xOf(points[points.length - 1].ts), baseY);
    ctx.lineTo(xOf(points[0].ts), baseY);
    ctx.closePath();
    ctx.fillStyle = areaGradient;
    ctx.fill();
  }

  function drawTrendLine(ctx, points, series, xOf, yOf, index) {
    ctx.strokeStyle = series.color || chartColors[index % chartColors.length];
    ctx.lineWidth = index === 0 ? 2.4 : 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach(function (point, pointIndex) {
      var x = xOf(point.ts);
      var y = yOf(getTrendPointValue(point, series));
      if (pointIndex === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  function drawTrendHoverMarkers(ctx, point, seriesList, xOf, yOf, radius) {
    var markerRadius = radius || 4;
    seriesList.forEach(function (series) {
      var value = getTrendPointValue(point, series);
      ctx.fillStyle = series.color || "#2468d8";
      ctx.beginPath();
      ctx.arc(xOf(point.ts), yOf(value), markerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = cssVar("--panel");
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function getAssetTrendPoints(range) {
    var events = getAssetEvents();
    if (!events.length) {
      return [];
    }
    var now = Date.now();
    var all = range === "all";
    var startTs = all ? events[0].ts : now - Number(range || 30) * 86400000;
    var running = 0;
    var points = [];
    events.forEach(function (event) {
      if (event.ts < startTs) {
        running = roundMoney(running + event.delta);
      }
    });
    if (!all) {
      points.push({ ts: startTs, value: running });
    }
    events.forEach(function (event) {
      if (event.ts >= startTs && event.ts <= now) {
        running = roundMoney(running + event.delta);
        points.push({ ts: event.ts, value: running });
      }
    });
    points.push({ ts: all ? Math.max(now, events[events.length - 1].ts) : now, value: running });
    return compactTrendPoints(points);
  }

  function getAssetEvents() {
    var events = [];
    state.records.forEach(function (record) {
      var sign = record.kind === "expense" ? -1 : 1;
      if (record.kind === "investment") {
        var profit = Number(record.investmentProfit) || 0;
        if (profit) {
          addAssetEvent(events, record.occurredAt, profit);
        }
        return;
      }
      if (record.settlement === "pending") {
        if (Array.isArray(record.settlementEvents) && record.settlementEvents.length) {
          record.settlementEvents.forEach(function (event) {
            addAssetEvent(events, event.at || record.occurredAt, sign * (Number(event.amount) || 0));
          });
          return;
        }
        if (Number(record.settledAmount) > 0) {
          addAssetEvent(events, record.settledAt || record.occurredAt, sign * Number(record.settledAmount));
        }
        return;
      }
      addAssetEvent(events, record.occurredAt, sign * Number(record.amount || 0));
    });
    return events
      .filter(function (event) { return Number.isFinite(event.ts) && event.delta; })
      .sort(function (a, b) { return a.ts - b.ts; });
  }

  function addAssetEvent(events, iso, delta) {
    var ts = new Date(iso).getTime();
    if (Number.isFinite(ts) && delta) {
      events.push({ ts: ts, delta: roundMoney(delta) });
    }
  }

  function compactTrendPoints(points) {
    var byDay = new Map();
    points.forEach(function (point) {
      var key = new Date(point.ts).toISOString().slice(0, 10);
      byDay.set(key, point);
    });
    return Array.from(byDay.values()).sort(function (a, b) { return a.ts - b.ts; });
  }

  function sampleTrendPoints(points, maxCount) {
    if (points.length <= maxCount) {
      return points;
    }
    var sampled = [];
    var lastIndex = points.length - 1;
    for (var i = 0; i < maxCount; i += 1) {
      sampled.push(points[Math.round(i * lastIndex / (maxCount - 1))]);
    }
    return sampled;
  }

  function drawTrendTimeTicks(ctx, minTs, maxTs, xOf, axisTop, axisY, height) {
    var ticks = getTrendTimeTicks(minTs, maxTs);
    if (!ticks.length) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = cssVar("--line");
    ctx.fillStyle = cssVar("--muted");
    ctx.font = "10px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ticks.forEach(function (tick) {
      var x = xOf(tick.ts);
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 4);
      ctx.stroke();
      ctx.fillText(tick.label, x, Math.min(height - 20, axisY + 8));
    });
    ctx.restore();
  }

  function getTrendTimeTicks(minTs, maxTs) {
    var minDate = startOfDay(new Date(minTs));
    var maxDate = startOfDay(new Date(maxTs));
    var spanDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000));
    var spanYears = spanDays / 365.25;
    if (spanYears > 100) {
      return [];
    }
    if (spanYears > 50) {
      return buildYearTicks(minDate, maxDate, Math.max(1, Math.ceil(spanYears / 8)));
    }
    if (spanYears > 10) {
      return buildQuarterTicks(minDate, maxDate, Math.max(1, Math.ceil((spanYears * 4) / 9)));
    }
    if (spanDays > 120) {
      return buildMonthTicks(minDate, maxDate, Math.max(1, Math.ceil((spanDays / 30.44) / 9)));
    }
    return buildDayTicks(minDate, maxDate, Math.max(1, Math.ceil(spanDays / 8)));
  }

  function buildDayTicks(minDate, maxDate, intervalDays) {
    var ticks = [];
    var cursor = startOfDay(minDate);
    for (var guard = 0; cursor <= maxDate && guard < 400; guard += 1) {
      ticks.push({ ts: cursor.getTime(), label: formatShortDate(cursor) });
      cursor.setDate(cursor.getDate() + intervalDays);
    }
    addFinalTick(ticks, maxDate, formatShortDate(maxDate));
    return ticks;
  }

  function buildMonthTicks(minDate, maxDate, intervalMonths) {
    var ticks = [];
    var cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    if (cursor < minDate) {
      cursor.setMonth(cursor.getMonth() + 1);
    }
    for (var guard = 0; cursor <= maxDate && guard < 180; guard += 1) {
      ticks.push({ ts: cursor.getTime(), label: formatYearMonth(cursor) });
      cursor.setMonth(cursor.getMonth() + intervalMonths);
    }
    return ticks;
  }

  function buildQuarterTicks(minDate, maxDate, intervalQuarters) {
    var ticks = [];
    var quarterMonth = Math.floor(minDate.getMonth() / 3) * 3;
    var cursor = new Date(minDate.getFullYear(), quarterMonth, 1);
    if (cursor < minDate) {
      cursor.setMonth(cursor.getMonth() + 3);
    }
    for (var guard = 0; cursor <= maxDate && guard < 240; guard += 1) {
      ticks.push({ ts: cursor.getTime(), label: cursor.getFullYear() + "Q" + (Math.floor(cursor.getMonth() / 3) + 1) });
      cursor.setMonth(cursor.getMonth() + intervalQuarters * 3);
    }
    return ticks;
  }

  function buildYearTicks(minDate, maxDate, intervalYears) {
    var ticks = [];
    var cursor = new Date(minDate.getFullYear(), 0, 1);
    if (cursor < minDate) {
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
    for (var guard = 0; cursor <= maxDate && guard < 160; guard += 1) {
      ticks.push({ ts: cursor.getTime(), label: String(cursor.getFullYear()) });
      cursor.setFullYear(cursor.getFullYear() + intervalYears);
    }
    return ticks;
  }

  function addFinalTick(ticks, date, label) {
    var ts = date.getTime();
    if (!ticks.length || Math.abs(ticks[ticks.length - 1].ts - ts) > 86400000) {
      ticks.push({ ts: ts, label: label });
    }
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function handleAssetTrendHover(event) {
    if (!assetTrendRenderState || !assetTrendRenderState.points.length) {
      hideAssetTrendTooltip();
      return;
    }
    var rect = els.assetTrendChart.getBoundingClientRect();
    var stateInfo = assetTrendRenderState;
    var targetTs = getAssetTrendTimestampFromEvent(event);
    var nearest = stateInfo.points.reduce(function (best, point) {
      return Math.abs(point.ts - targetTs) < Math.abs(best.ts - targetTs) ? point : best;
    }, stateInfo.points[0]);
    var pointX = stateInfo.padLeft + (nearest.ts - stateInfo.minTs) / (stateInfo.maxTs - stateInfo.minTs) * stateInfo.plotW;
    var pointValue = getTrendPointValue(nearest, stateInfo.data.series[0]);
    var pointY = stateInfo.padTop + (stateInfo.maxValue - pointValue) / (stateInfo.maxValue - stateInfo.minValue) * stateInfo.plotH;
    var dragRange = null;
    if (assetTrendDrag) {
      assetTrendDrag.currentTs = targetTs;
      dragRange = normalizeTimestampRange(assetTrendDrag.startTs, assetTrendDrag.currentTs);
    }
    drawAssetTrendChart(nearest, dragRange);
    var tooltip = els.assetTrendTooltip;
    tooltip.innerHTML = renderAssetTrendTooltip(nearest, stateInfo.data);
    tooltip.classList.remove("hidden");
    var tooltipWidth = stateInfo.data.series.length > 1 ? 190 : 132;
    var left = Math.max(8, Math.min(rect.width - tooltipWidth, pointX + 12));
    var top = Math.max(8, pointY - 42);
    tooltip.style.left = Math.round(left) + "px";
    tooltip.style.top = Math.round(top) + "px";
  }

  function renderAssetTrendTooltip(point, data) {
    var html = "<strong>" + escapeHtml(formatTrendDate(point.ts)) + "</strong>";
    if (data.series.length <= 1) {
      html += "<span>" + escapeHtml(privateMoney(getTrendPointValue(point, data.series[0]))) + "</span>";
      return html;
    }
    html += "<div class=\"trend-tooltip-list\">";
    data.series.forEach(function (series) {
      html += "<div><i style=\"background:" + escapeHtml(series.color) + "\"></i><span>" + escapeHtml(series.name) + "</span><b>" + escapeHtml(privateMoney(getTrendPointValue(point, series))) + "</b></div>";
    });
    html += "</div>";
    return html;
  }

  function hideAssetTrendTooltip() {
    if (assetTrendDrag) {
      return;
    }
    if (els.assetTrendTooltip) {
      els.assetTrendTooltip.classList.add("hidden");
    }
    drawAssetTrendChart();
  }

  function beginAssetTrendDrag(event) {
    if (!assetTrendRenderState) {
      return;
    }
    assetTrendDrag = {
      startTs: getAssetTrendTimestampFromEvent(event),
      currentTs: getAssetTrendTimestampFromEvent(event)
    };
    event.preventDefault();
  }

  function finishAssetTrendDrag(event) {
    if (!assetTrendRenderState || !assetTrendDrag) {
      return;
    }
    assetTrendDrag.currentTs = getAssetTrendTimestampFromEvent(event);
    var range = normalizeTimestampRange(assetTrendDrag.startTs, assetTrendDrag.currentTs);
    assetTrendDrag = null;
    applyDateFilterFromTimestamps(range.start, range.end);
  }

  function getAssetTrendTimestampFromEvent(event) {
    var stateInfo = assetTrendRenderState;
    var rect = els.assetTrendChart.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var clampedX = Math.max(stateInfo.padLeft, Math.min(rect.width - stateInfo.padRight, x));
    var ratio = stateInfo.plotW ? (clampedX - stateInfo.padLeft) / stateInfo.plotW : 0;
    return stateInfo.minTs + ratio * (stateInfo.maxTs - stateInfo.minTs);
  }

  function normalizeTimestampRange(a, b) {
    return {
      start: Math.min(a, b),
      end: Math.max(a, b)
    };
  }

  function applyDateFilterFromTimestamps(startTs, endTs) {
    var oneDay = 86400000;
    if (Math.abs(endTs - startTs) < oneDay) {
      endTs = startTs;
    }
    var startDate = dateInputValue(new Date(startTs));
    var endDate = dateInputValue(new Date(endTs));
    leaveBatchMode();
    state.filters.startDate = startDate;
    state.filters.endDate = endDate;
    state.filters.pendingView = "";
    state.pagination.page = 1;
    els.startDateFilter.value = startDate;
    els.endDateFilter.value = endDate;
    openAdvancedFilters();
    render();
    showToast(startDate === endDate ? "已筛选 " + startDate + "。" : "已筛选 " + startDate + " 至 " + endDate + "。");
  }

  function getVisibleDateSelectionRange(minTs, maxTs) {
    var start = dateFilterStart(state.filters.startDate);
    var end = dateFilterEnd(state.filters.endDate);
    if (start == null && end == null) {
      return null;
    }
    start = start == null ? minTs : start;
    end = end == null ? maxTs : end;
    if (end < minTs || start > maxTs) {
      return null;
    }
    return {
      start: Math.max(start, minTs),
      end: Math.min(end, maxTs)
    };
  }

  function getStructureEntries(kind) {
    var grouped = {};
    getFilteredRecords().forEach(function (record) {
      if (record.kind === "investment") {
        var profit = Number(record.investmentProfit) || 0;
        if ((kind === "income" && profit > 0) || (kind === "expense" && profit < 0)) {
          grouped["理财"] = (grouped["理财"] || 0) + Math.abs(profit);
        }
        return;
      }
      if (record.kind !== kind) {
        return;
      }
      var value = getRealizedAmount(record);
      if (value <= 0) {
        return;
      }
      grouped[record.category] = (grouped[record.category] || 0) + value;
    });
    return Object.keys(grouped)
      .map(function (key) { return { name: key, value: grouped[key] }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
  }

  function openChartDrawer(kind) {
    if (!els.chartDrawer.classList.contains("hidden") && els.chartDrawer.getAttribute("data-chart-kind") === kind) {
      closeChartDrawer();
      return;
    }
    els.chartDrawer.setAttribute("data-chart-kind", kind);
    els.chartDrawer.classList.remove("hidden");
    renderChartDrawerContent(kind);
  }

  function refreshChartDrawer() {
    if (els.chartDrawer.classList.contains("hidden")) {
      return;
    }
    var kind = els.chartDrawer.getAttribute("data-chart-kind");
    if (kind) {
      renderChartDrawerContent(kind);
    }
  }

  function renderChartDrawerContent(kind) {
    var sourceBox = document.querySelector("[data-chart-detail='" + kind + "']");
    var entries = getStructureEntries(kind);
    var total = entries.reduce(function (sum, item) { return sum + item.value; }, 0);
    els.chartDrawerTitle.textContent = kind === "income" ? "收入结构详情" : "支出结构详情";
    if (!entries.length) {
      els.chartDrawerBody.innerHTML = "<div class=\"empty-detail\">暂无数据</div>";
    } else {
      els.chartDrawerBody.innerHTML = entries.map(function (item, index) {
        var percent = total ? Math.round(item.value / total * 100) : 0;
        return "<button class=\"detail-item\" type=\"button\" data-structure-kind=\"" + escapeHtml(kind) + "\" data-structure-category=\"" + escapeHtml(item.name) + "\">" +
          "<span class=\"detail-color\" style=\"background:" + chartColors[index % chartColors.length] + "\"></span>" +
          "<div><strong>" + escapeHtml(item.name) + "</strong><span>" + percent + "%</span></div>" +
          "<b>" + escapeHtml(privateMoney(item.value)) + "</b>" +
          "</button>";
      }).join("");
    }
    if (sourceBox) {
      var alignedTop = sourceBox.offsetTop + sourceBox.offsetHeight - els.chartDrawer.offsetHeight;
      els.chartDrawer.style.top = Math.round(alignedTop) + "px";
    }
  }

  function handleChartDrawerClick(event) {
    var item = event.target.closest("[data-structure-category]");
    if (!item) {
      return;
    }
    applyStructureCategoryFilter(item.getAttribute("data-structure-kind"), item.getAttribute("data-structure-category"));
  }

  function applyStructureCategoryFilter(kind, category) {
    var selectedKind = category === "理财" ? "investment" : kind;
    leaveBatchMode();
    state.filters.kind = selectedKind;
    state.filters.pendingView = "";
    state.filters.primaryCategory = selectedKind === "investment" ? "" : category;
    state.filters.secondaryCategory = "";
    state.pagination.page = 1;
    els.kindFilter.value = selectedKind;
    els.primaryCategoryFilter.value = state.filters.primaryCategory;
    els.secondaryCategoryFilter.value = "";
    openAdvancedFilters();
    refreshAdvancedFilterOptions();
    render();
    showToast("已筛选“" + category + "”。");
  }

  function closeChartDrawer() {
    if (els.chartDrawer) {
      els.chartDrawer.classList.add("hidden");
      els.chartDrawer.removeAttribute("data-chart-kind");
    }
  }

  function toggleAssetVisibility() {
    state.assetVisible = !state.assetVisible;
    localStorage.setItem(ASSET_VISIBILITY_KEY, state.assetVisible ? "visible" : "hidden");
    hideAssetTrendTooltip();
    renderSummary();
    renderCharts();
    refreshChartDrawer();
  }

  function setCurrentAsset() {
    leaveBatchMode();
    var summary = getAssetSummary();
    var raw = window.prompt("输入当前总资产金额，将自动生成误差项：", String(summary.totalAssets));
    if (raw == null) {
      return;
    }
    if (!/[0-9]/.test(cleanText(raw))) {
      showToast("请输入有效金额。");
      return;
    }
    var target = roundMoney(parseMoney(raw));
    var diff = roundMoney(target - summary.totalAssets);
    if (Math.abs(diff) < 0.01) {
      showToast("当前总资产已经一致，无需生成误差项。");
      return;
    }
    var nowIso = new Date().toISOString();
    state.records.push({
      id: createId(),
      kind: diff > 0 ? "income" : "expense",
      amount: Math.abs(diff),
      category: "其他",
      project: "",
      target: "",
      settlement: "none",
      settledAmount: 0,
      settlementEvents: [],
      settledAt: "",
      investmentProfit: 0,
      occurredAt: nowIso,
      note: "当前资产校准误差项，目标总资产：" + formatMoney(target),
      tags: ["误差项", "资产校准"],
      createdAt: nowIso,
      updatedAt: nowIso
    });
    saveRecords();
    resetViewFilters();
    showToast("已生成 " + (diff > 0 ? "其他收入" : "其他支出") + " 误差项 " + formatMoney(Math.abs(diff)) + "。");
  }

  function resetViewFilters() {
    leaveBatchMode();
    resetFilterValues();
    closeAdvancedFilters();
    render();
  }

  function resetFilterValues() {
    state.filters.kind = "all";
    state.filters.search = "";
    state.filters.startDate = "";
    state.filters.endDate = "";
    state.filters.minAmount = "";
    state.filters.maxAmount = "";
    state.filters.primaryCategory = "";
    state.filters.secondaryCategory = "";
    state.filters.pendingView = "";
    state.pagination.page = 1;
    els.kindFilter.value = "all";
    els.searchInput.value = "";
    els.startDateFilter.value = "";
    els.endDateFilter.value = "";
    els.minAmountFilter.value = "";
    els.maxAmountFilter.value = "";
    els.primaryCategoryFilter.value = "";
    els.secondaryCategoryFilter.value = "";
    refreshAdvancedFilterOptions();
  }

  function togglePendingView(kind) {
    leaveBatchMode();
    state.filters.pendingView = state.filters.pendingView === kind ? "" : kind;
    if (state.filters.pendingView) {
      els.kindFilter.value = "all";
      state.filters.kind = "all";
      state.filters.search = "";
      state.filters.startDate = "";
      state.filters.endDate = "";
      state.filters.minAmount = "";
      state.filters.maxAmount = "";
      state.filters.primaryCategory = "";
      state.filters.secondaryCategory = "";
      state.pagination.page = 1;
      els.searchInput.value = "";
      els.startDateFilter.value = "";
      els.endDateFilter.value = "";
      els.minAmountFilter.value = "";
      els.maxAmountFilter.value = "";
      els.primaryCategoryFilter.value = "";
      els.secondaryCategoryFilter.value = "";
      refreshAdvancedFilterOptions();
    }
    render();
  }

  function toggleAdvancedFilters() {
    if (els.advancedFilters.classList.contains("hidden")) {
      openAdvancedFilters();
      return;
    }
    resetViewFilters();
  }

  function openAdvancedFilters() {
    els.advancedFilters.classList.remove("hidden");
    els.moreFiltersBtn.textContent = "清空筛选";
    els.moreFiltersBtn.setAttribute("aria-expanded", "true");
  }

  function closeAdvancedFilters() {
    els.advancedFilters.classList.add("hidden");
    els.moreFiltersBtn.textContent = "更多筛选";
    els.moreFiltersBtn.setAttribute("aria-expanded", "false");
  }

  function renderDateFilterControls() {
    var hasDateFilter = Boolean(state.filters.startDate || state.filters.endDate);
    els.clearDateFilterBtn.classList.toggle("hidden", !hasDateFilter);
  }

  function clearDateFilter() {
    state.filters.startDate = "";
    state.filters.endDate = "";
    state.filters.pendingView = "";
    state.pagination.page = 1;
    els.startDateFilter.value = "";
    els.endDateFilter.value = "";
    if (!hasAnyNonDateFilter()) {
      closeAdvancedFilters();
    }
    render();
    showToast("已清除时间筛选。");
  }

  function hasAnyNonDateFilter() {
    return Boolean(
      state.filters.kind !== "all" ||
      state.filters.search ||
      state.filters.minAmount ||
      state.filters.maxAmount ||
      state.filters.primaryCategory ||
      state.filters.secondaryCategory ||
      state.filters.pendingView
    );
  }

  function resetCategoryFilterLevels() {
    state.filters.primaryCategory = "";
    state.filters.secondaryCategory = "";
    els.primaryCategoryFilter.value = "";
    els.secondaryCategoryFilter.value = "";
  }

  function refreshAdvancedFilterOptions() {
    var primaryOptions = getPrimaryFilterOptions(state.filters.kind);
    fillDatalistOptions(els.primaryCategoryOptions, primaryOptions);

    var secondaryOptions = getSecondaryFilterOptions(state.filters.kind, state.filters.primaryCategory);
    fillDatalistOptions(els.secondaryCategoryOptions, secondaryOptions);
    els.secondaryCategoryFilter.disabled = !cleanText(state.filters.primaryCategory) || !secondaryOptions.length;
    var secondaryButton = document.querySelector("[data-combo-for='secondaryCategoryFilter']");
    if (secondaryButton) {
      secondaryButton.disabled = els.secondaryCategoryFilter.disabled;
    }
  }

  function getPrimaryFilterOptions(kind) {
    var set = new Set();
    if (kind === "all" || kind === "expense") {
      categoryDefaults.expense.forEach(function (item) { set.add(item); });
    }
    if (kind === "all" || kind === "income") {
      categoryDefaults.income.forEach(function (item) { set.add(item); });
    }
    if (kind === "all" || kind === "investment") {
      projectDefaults.forEach(function (item) { set.add(item); });
    }
    state.records.forEach(function (record) {
      if (kind === "all" || record.kind === kind) {
        var value = getPrimaryFilterValue(record);
        if (value) {
          set.add(value);
        }
      }
    });
    return Array.from(set);
  }

  function getSecondaryFilterOptions(kind, primary) {
    var primaryPrefix = cleanText(primary);
    if (!primaryPrefix) {
      return [];
    }
    var set = new Set();
    if (kind === "all" || kind === "investment") {
      Object.keys(targetDefaultsByProject).forEach(function (project) {
        if (startsWithText(project, primaryPrefix)) {
          (targetDefaultsByProject[project] || []).forEach(function (item) { set.add(item); });
        }
      });
    }
    state.records.forEach(function (record) {
      if ((kind === "all" || record.kind === kind) && startsWithText(getPrimaryFilterValue(record), primaryPrefix)) {
        var value = getSecondaryFilterValue(record);
        if (value) {
          set.add(value);
        }
      }
    });
    return Array.from(set);
  }

  function fillDatalistOptions(datalist, options) {
    datalist.innerHTML = uniqueTags(options).map(function (item) {
      return "<option value=\"" + escapeHtml(item) + "\"></option>";
    }).join("");
  }

  function toggleBatchMode() {
    state.batch.enabled = !state.batch.enabled;
    state.batch.selectedIds.clear();
    closeActionMenu();
    render();
  }

  function leaveBatchMode() {
    if (!state.batch.enabled && !state.batch.selectedIds.size) {
      return;
    }
    state.batch.enabled = false;
    state.batch.selectedIds.clear();
    closeActionMenu();
    closeBatchExportMenu();
    closeBatchCategoryMenu();
  }

  function renderBatchControls(records, totalRecords) {
    var selectedCount = state.batch.selectedIds.size;
    els.batchTools.classList.toggle("hidden", !state.batch.enabled);
    els.batchToggleBtn.textContent = state.batch.enabled ? "取消" : "批量选择";
    var rangeStart = totalRecords ? ((state.pagination.page - 1) * state.pagination.pageSize + 1) : 0;
    var rangeEnd = totalRecords ? (rangeStart + records.length - 1) : 0;
    els.visibleCount.textContent = "共 " + totalRecords + " 条，显示 " + rangeStart + "-" + rangeEnd + (state.batch.enabled ? "，已选 " + selectedCount + " 条" : "");
    els.selectAllBtn.disabled = !records.length;
    els.clearSelectionBtn.disabled = !selectedCount;
    els.deleteSelectedBtn.disabled = !selectedCount;
    els.batchCategoryBtn.disabled = !selectedCount;
    els.exportSelectedBtn.disabled = !selectedCount;
    if (!state.batch.enabled || !selectedCount) {
      closeBatchExportMenu();
      closeBatchCategoryMenu();
    }
  }

  function handleBatchSelectionChange(event) {
    var checkbox = event.target.closest("input[data-select-id]");
    if (!checkbox) {
      return;
    }
    var id = checkbox.getAttribute("data-select-id");
    if (checkbox.checked) {
      state.batch.selectedIds.add(id);
    } else {
      state.batch.selectedIds.delete(id);
    }
    render();
  }

  function selectAllVisibleRecords() {
    getFilteredRecords().forEach(function (record) {
      state.batch.selectedIds.add(record.id);
    });
    render();
  }

  function clearBatchSelection() {
    clearFilteredBatchSelection();
    render();
  }

  function deleteSelectedRecords() {
    var ids = Array.from(state.batch.selectedIds);
    if (!ids.length) {
      return;
    }
    if (!window.confirm("确定删除选中的 " + ids.length + " 条记录吗？")) {
      return;
    }
    var idSet = new Set(ids);
    state.records = state.records.filter(function (record) {
      return !idSet.has(record.id);
    });
    clearBatchSelectionAfterAction();
    saveRecords();
    render();
    showToast("已删除 " + ids.length + " 条记录。");
  }

  function toggleBatchCategoryMenu() {
    if (!state.batch.selectedIds.size) {
      showToast("请先选择要设置分类的记录。");
      return;
    }
    var editableRecords = getSelectedRecords().filter(function (record) {
      return record.kind === "income" || record.kind === "expense";
    });
    if (!editableRecords.length) {
      showToast("选中的记录没有可设置分类的收入或支出。");
      return;
    }
    var willOpen = els.batchCategoryMenu.classList.contains("hidden");
    closeHeaderMenus();
    closeActionMenu();
    closeBatchExportMenu();
    closeBatchCategoryMenu();
    if (willOpen) {
      fillDatalistOptions(els.batchCategoryOptions, getBatchCategoryOptions());
      els.batchCategoryInput.value = "";
      els.batchCategoryMenu.classList.remove("hidden");
      els.batchCategoryBtn.setAttribute("aria-expanded", "true");
      window.setTimeout(function () {
        els.batchCategoryInput.focus();
      }, 0);
    }
  }

  function closeBatchCategoryMenu() {
    if (els.batchCategoryMenu) {
      els.batchCategoryMenu.classList.add("hidden");
      els.batchCategoryBtn.setAttribute("aria-expanded", "false");
    }
  }

  function applyBatchCategory() {
    var category = cleanText(els.batchCategoryInput.value) || "其他";
    var nowIso = new Date().toISOString();
    var changed = 0;
    var skipped = 0;
    getSelectedRecords().forEach(function (record) {
      if (record.kind !== "income" && record.kind !== "expense") {
        skipped += 1;
        return;
      }
      if (record.category !== category) {
        record.category = category;
        record.updatedAt = nowIso;
        changed += 1;
      }
    });
    closeBatchCategoryMenu();
    if (!changed) {
      clearBatchSelectionAfterAction();
      render();
      showToast(skipped ? "没有需要修改的收入或支出分类，已跳过理财记录。" : "没有需要修改的分类。");
      return;
    }
    clearBatchSelectionAfterAction();
    saveRecords();
    fillDatalists();
    refreshAdvancedFilterOptions();
    render();
    showToast("已将 " + changed + " 条记录设置为“" + category + "”" + (skipped ? "，跳过 " + skipped + " 条理财。" : "。"));
  }

  function getSelectedRecords() {
    var ids = new Set(Array.from(state.batch.selectedIds));
    return state.records.filter(function (record) {
      return ids.has(record.id);
    });
  }

  function getBatchCategoryOptions() {
    var set = new Set();
    categoryDefaults.expense.forEach(function (item) { set.add(item); });
    categoryDefaults.income.forEach(function (item) { set.add(item); });
    state.records.forEach(function (record) {
      if ((record.kind === "income" || record.kind === "expense") && record.category) {
        set.add(record.category);
      }
    });
    return Array.from(set);
  }

  function toggleBatchExportMenu() {
    if (!state.batch.selectedIds.size) {
      showToast("请先选择要导出的记录。");
      return;
    }
    var willOpen = els.batchExportMenu.classList.contains("hidden");
    closeHeaderMenus();
    closeActionMenu();
    closeBatchCategoryMenu();
    closeBatchExportMenu();
    if (willOpen) {
      els.batchExportMenu.classList.remove("hidden");
      els.exportSelectedBtn.setAttribute("aria-expanded", "true");
    }
  }

  function closeBatchExportMenu() {
    if (els.batchExportMenu) {
      els.batchExportMenu.classList.add("hidden");
      els.exportSelectedBtn.setAttribute("aria-expanded", "false");
    }
  }

  function exportSelectedRecords(format) {
    var ids = new Set(Array.from(state.batch.selectedIds));
    var records = state.records.filter(function (record) {
      return ids.has(record.id);
    });
    if (!records.length) {
      showToast("请先选择要导出的记录。");
      return;
    }
    var filename = "local-ledger-selected-" + todayStamp() + "." + (format === "csv" ? "csv" : "json");
    var content = format === "csv" ? recordsToCsv(records) : JSON.stringify({
      app: "local-ledger",
      version: 4,
      exportedAt: new Date().toISOString(),
      records: records
    }, null, 2);
    var type = format === "csv" ? "text/csv;charset=utf-8" : "application/json";
    saveFile(filename, content, type)
      .then(function (saved) {
        if (saved) {
          clearBatchSelectionAfterAction();
          render();
          showToast("已导出 " + records.length + " 条记录。");
        }
      });
  }

  function clearFilteredBatchSelection() {
    var filteredIds = new Set(getFilteredRecords().map(function (record) { return record.id; }));
    Array.from(state.batch.selectedIds).forEach(function (id) {
      if (filteredIds.has(id)) {
        state.batch.selectedIds.delete(id);
      }
    });
  }

  function clearBatchSelectionAfterAction() {
    state.batch.selectedIds.clear();
    closeBatchExportMenu();
    closeBatchCategoryMenu();
  }

  function pruneBatchSelection() {
    if (!state.batch.selectedIds.size) {
      return;
    }
    var existingIds = new Set(state.records.map(function (record) { return record.id; }));
    Array.from(state.batch.selectedIds).forEach(function (id) {
      if (!existingIds.has(id)) {
        state.batch.selectedIds.delete(id);
      }
    });
  }

  function getPendingRecords(kind) {
    return state.records.filter(function (record) {
      return record.kind === kind && record.settlement === "pending" && getRemainingAmount(record) > 0;
    });
  }

  function getRealizedAmount(record) {
    if (record.kind === "investment") {
      return Math.abs(Number(record.investmentProfit) || 0);
    }
    if (record.settlement === "pending") {
      return roundMoney(Number(record.settledAmount) || 0);
    }
    return record.amount;
  }

  function getRemainingAmount(record) {
    if (record.settlement !== "pending") {
      return 0;
    }
    return roundMoney(Math.max(0, record.amount - (Number(record.settledAmount) || 0)));
  }

  function setupCanvas(canvas) {
    var ratio = window.devicePixelRatio || 1;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function drawEmptyChart(ctx, width, height, text) {
    ctx.fillStyle = cssVar("--muted");
    ctx.font = "14px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, width / 2, height / 2);
  }

  function truncateText(ctx, text, maxWidth) {
    var value = String(text);
    if (ctx.measureText(value).width <= maxWidth) {
      return value;
    }
    while (value.length > 1 && ctx.measureText(value + "...").width > maxWidth) {
      value = value.slice(0, -1);
    }
    return value + "...";
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function exportJson() {
    var payload = {
      app: "local-ledger",
      version: 4,
      exportedAt: new Date().toISOString(),
      records: state.records
    };
    saveFile("local-ledger-" + todayStamp() + ".json", JSON.stringify(payload, null, 2), "application/json")
      .then(function (saved) {
        if (saved) {
          showToast("JSON 备份已导出。");
        }
      });
  }

  function exportCsv() {
    saveFile("local-ledger-" + todayStamp() + ".csv", recordsToCsv(state.records), "text/csv;charset=utf-8")
      .then(function (saved) {
        if (saved) {
          showToast("CSV 表格已导出。");
        }
      });
  }

  function recordsToCsv(records) {
    var headers = [
      "id",
      "occurredAt",
      "kind",
      "amount",
      "category",
      "project",
      "target",
      "settlement",
      "settledAmount",
      "settledAt",
      "investmentProfit",
      "closedAt",
      "note",
      "tags",
      "createdAt",
      "updatedAt"
    ];
    var rows = records
      .slice()
      .sort(function (a, b) { return new Date(a.occurredAt) - new Date(b.occurredAt); })
      .map(function (record) {
        return headers.map(function (key) {
          var value = key === "tags" ? (record.tags || []).join("|") : record[key];
          return csvCell(value == null ? "" : String(value));
        }).join(",");
      });
    return headers.join(",") + "\n" + rows.join("\n");
  }

  function copyImportPrompt() {
    readPromptText()
      .then(copyText)
      .then(function () {
        showToast("账单转换提示词已复制。");
      })
      .catch(function () {
        showToast("复制失败，浏览器可能限制了剪贴板权限。");
      });
  }

  function readPromptText() {
    return fetch("./AI_IMPORT_PROMPT.md", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Prompt file unavailable");
        }
        return response.text();
      })
      .catch(function () {
        return FALLBACK_IMPORT_PROMPT;
      });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        var ok = document.execCommand("copy");
        textarea.remove();
        ok ? resolve() : reject(new Error("Copy command failed"));
      } catch (error) {
        textarea.remove();
        reject(error);
      }
    });
  }

  function importFile(event) {
    var file = event.target.files[0];
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = String(reader.result || "");
        var incomingRaw = file.name.toLowerCase().endsWith(".csv") ? parseCsv(text) : recordsFromJson(text);
        var normalized = incomingRaw
          .map(function (record, index) { return normalizeImportedRecord(record, index); })
          .filter(Boolean);

        if (!normalized.length) {
          throw new Error("No usable records");
        }

        state.pendingImport = {
          fileName: file.name,
          mode: state.importMode,
          records: normalized,
          summary: buildImportPreviewSummary(normalized)
        };
        openImportPreview();
      } catch (error) {
        showToast("导入失败，请确认文件是 JSON 或 CSV 账单。");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function buildImportPreviewSummary(records) {
    var counts = {
      income: 0,
      expense: 0,
      investment: 0
    };
    var localIds = new Set(state.records.map(function (record) { return record.id; }));
    var importIds = new Set();
    var localDuplicateIds = new Set();
    var fileDuplicateIds = new Set();
    var minTs = Infinity;
    var maxTs = -Infinity;

    records.forEach(function (record) {
      if (counts[record.kind] != null) {
        counts[record.kind] += 1;
      }
      if (record.id) {
        if (importIds.has(record.id)) {
          fileDuplicateIds.add(record.id);
        }
        importIds.add(record.id);
        if (localIds.has(record.id)) {
          localDuplicateIds.add(record.id);
        }
      }
      var ts = new Date(record.occurredAt).getTime();
      if (!Number.isNaN(ts)) {
        minTs = Math.min(minTs, ts);
        maxTs = Math.max(maxTs, ts);
      }
    });

    return {
      total: records.length,
      counts: counts,
      dateRange: minTs === Infinity ? "无有效时间" : formatTrendDate(minTs) + " - " + formatTrendDate(maxTs),
      localDuplicateCount: localDuplicateIds.size,
      fileDuplicateCount: fileDuplicateIds.size
    };
  }

  function renderImportPreview() {
    var pending = state.pendingImport;
    if (!pending) {
      return;
    }
    var summary = pending.summary;
    var modeLabel = pending.mode === "replace" ? "覆盖当前账本" : "合并到当前账本";
    var duplicateClass = summary.localDuplicateCount || summary.fileDuplicateCount ? " has-warning" : "";
    els.importPreviewConfirmBtn.textContent = pending.mode === "replace" ? "确认覆盖" : "确认合并";
    els.importPreviewBody.innerHTML =
      "<div class=\"import-preview-meta\">" +
        "<span>文件</span><strong>" + escapeHtml(pending.fileName) + "</strong>" +
        "<span>方式</span><strong>" + escapeHtml(modeLabel) + "</strong>" +
      "</div>" +
      "<div class=\"import-preview-grid\">" +
        previewMetric("可导入条目", summary.total + " 条") +
        previewMetric("收入", summary.counts.income + " 条") +
        previewMetric("支出", summary.counts.expense + " 条") +
        previewMetric("理财", summary.counts.investment + " 条") +
      "</div>" +
      "<div class=\"import-preview-line\"><span>时间范围</span><strong>" + escapeHtml(summary.dateRange) + "</strong></div>" +
      "<div class=\"import-preview-line" + duplicateClass + "\"><span>重复 ID</span><strong>与当前账本重复 " + summary.localDuplicateCount + " 个；文件内重复 " + summary.fileDuplicateCount + " 个</strong></div>" +
      "<p class=\"import-preview-note\">" +
        (pending.mode === "replace"
          ? "确认后会先备份当前账本，再用本次文件替换全部数据。"
          : "确认后会先备份当前账本，再按 ID 合并；重复记录会保留更新时间较新的版本。") +
      "</p>";
  }

  function previewMetric(label, value) {
    return "<div class=\"import-preview-metric\"><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
  }

  function confirmImportPreview() {
    var pending = state.pendingImport;
    if (!pending || !pending.records.length) {
      closeImportPreview();
      return;
    }
    leaveBatchMode();
    localStorage.setItem(BACKUP_KEY, JSON.stringify({
      backedUpAt: new Date().toISOString(),
      records: state.records
    }));
    if (pending.mode === "replace") {
      state.records = pending.records;
      saveRecords();
      state.pagination.page = 1;
      closeImportPreview();
      render();
      showToast("覆盖导入完成：共 " + pending.records.length + " 条。");
      return;
    }
    var result = mergeRecords(state.records, pending.records);
    state.records = result.records;
    saveRecords();
    state.pagination.page = 1;
    closeImportPreview();
    render();
    showToast("导入完成：新增 " + result.added + " 条，更新 " + result.updated + " 条，跳过 " + result.skipped + " 条。");
  }

  function recordsFromJson(text) {
    var payload = JSON.parse(text);
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && Array.isArray(payload.records)) {
      return payload.records;
    }
    throw new Error("No records");
  }

  function mergeRecords(current, incoming) {
    var map = new Map();
    var added = 0;
    var updated = 0;
    var skipped = 0;

    current.forEach(function (record) {
      map.set(record.id, record);
    });

    incoming.forEach(function (record) {
      var old = map.get(record.id);
      if (!old) {
        map.set(record.id, record);
        added += 1;
        return;
      }
      var oldTime = new Date(old.updatedAt || old.createdAt || old.occurredAt).getTime();
      var newTime = new Date(record.updatedAt || record.createdAt || record.occurredAt).getTime();
      if (newTime > oldTime) {
        map.set(record.id, record);
        updated += 1;
      } else {
        skipped += 1;
      }
    });

    return {
      added: added,
      updated: updated,
      skipped: skipped,
      records: Array.from(map.values()).sort(function (a, b) {
        return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
      })
    };
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var quote = false;

    for (var i = 0; i < text.length; i += 1) {
      var ch = text[i];
      var next = text[i + 1];
      if (quote && ch === "\"" && next === "\"") {
        cell += "\"";
        i += 1;
      } else if (ch === "\"") {
        quote = !quote;
      } else if (!quote && ch === ",") {
        row.push(cell);
        cell = "";
      } else if (!quote && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && next === "\n") {
          i += 1;
        }
        row.push(cell);
        if (row.some(function (value) { return cleanText(value); })) {
          rows.push(row);
        }
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.some(function (value) { return cleanText(value); })) {
      rows.push(row);
    }
    if (!rows.length) {
      return [];
    }

    var headers = rows[0].map(cleanText);
    return rows.slice(1).map(function (values) {
      var item = {};
      headers.forEach(function (header, index) {
        item[header || ("column" + index)] = values[index] || "";
      });
      return item;
    });
  }

  function normalizeStoredRecord(record, index) {
    if (!record || typeof record !== "object") {
      return null;
    }
    var nowIso = new Date().toISOString();
    var kind = normalizeKind(record.kind) || "expense";
    var amount = roundMoney(Math.abs(parseMoney(record.amount)));
    var occurredAt = validIso(record.occurredAt) || nowIso;

    if (kind !== "investment" && amount <= 0) {
      return null;
    }

    var settlement = record.settlement === "pending" ? "pending" : "none";
    var settledAmount = settlement === "pending" ? clampMoney(parseMoney(record.settledAmount), 0, amount) : 0;
    if (settlement === "pending" && settledAmount >= amount) {
      settlement = "none";
      settledAmount = 0;
    }
    return {
      id: cleanText(record.id) || "stored-" + hashCode(String(index) + occurredAt + amount),
      kind: kind,
      amount: amount,
      category: kind === "investment" ? normalizeInvestmentAction(record.category) : (cleanText(record.category) || "其他"),
      project: kind === "investment" ? cleanText(record.project) : "",
      target: kind === "investment" ? cleanText(record.target) : "",
      settlement: settlement,
      settledAmount: settledAmount,
      settlementEvents: Array.isArray(record.settlementEvents) ? record.settlementEvents : [],
      settledAt: validIso(record.settledAt) || "",
      investmentProfit: kind === "investment" ? roundMoney(parseMoney(record.investmentProfit)) : 0,
      closedAt: kind === "investment" ? (validIso(record.closedAt) || "") : "",
      occurredAt: occurredAt,
      note: cleanText(record.note),
      tags: Array.isArray(record.tags) ? record.tags.map(cleanText).filter(Boolean) : splitTags(record.tags || ""),
      createdAt: validIso(record.createdAt) || nowIso,
      updatedAt: validIso(record.updatedAt) || validIso(record.createdAt) || nowIso
    };
  }

  function normalizeImportedRecord(record, index) {
    if (!record || typeof record !== "object") {
      return null;
    }
    var nowIso = new Date().toISOString();
    var rawKind = getAny(record, ["kind", "direction", "type", "类型", "账目类型", "收支", "收支类型", "交易类型"]);
    var incomeValue = parseMoney(getAny(record, ["income", "收入", "收款", "入账"]));
    var expenseValue = parseMoney(getAny(record, ["expense", "支出", "付款", "出账"]));
    var amountValue = parseMoney(getAny(record, ["amount", "金额", "交易金额", "money", "value", "数额"]));
    var kind = inferKind(rawKind, amountValue, incomeValue, expenseValue);
    var amount = amountValue;

    if (incomeValue > 0 && !amountValue) {
      amount = incomeValue;
    }
    if (expenseValue > 0 && !amountValue) {
      amount = expenseValue;
    }
    amount = roundMoney(Math.abs(amount));

    if (kind !== "investment" && amount <= 0) {
      return null;
    }

    var occurredAt = parseDateValue(getAny(record, ["occurredAt", "time", "date", "日期", "时间", "交易时间", "记账时间"])) || nowIso;
    var category = cleanText(getAny(record, ["category", "分类", "类别", "交易分类", "明细分类", "操作"]));
    if (!category) {
      category = kind === "investment" ? "买入" : "其他";
    }
    if (kind === "investment") {
      category = normalizeInvestmentAction(category);
    }
    var project = kind === "investment" ? (cleanText(getAny(record, ["project", "理财项目", "项目", "资产类别", "资产类型"])) || "基金") : "";
    var target = kind === "investment" ? cleanText(getAny(record, ["target", "investmentTarget", "具体标的", "二级分类", "标的", "基金名称", "股票名称", "债券名称", "合约", "币种"])) : "";
    var settlementText = cleanText(getAny(record, ["settlement", "结算", "状态", "预结算", "标签"]));
    var pending = kind !== "investment" && (/预|待|pending/i.test(settlementText) || /预/.test(String(rawKind || "")));
    var settledAmount = pending ? clampMoney(parseMoney(getAny(record, ["settledAmount", "已结算金额", "已还金额", "已收金额"])), 0, amount) : 0;
    if (pending && settledAmount >= amount) {
      pending = false;
      settledAmount = 0;
    }
    var investmentProfit = kind === "investment" ? roundMoney(parseMoney(getAny(record, ["investmentProfit", "收益", "理财收益", "profit"]))) : 0;
    var note = cleanText(getAny(record, ["note", "备注", "详情", "说明", "描述", "名称", "商品", "商户"]));
    var tags = splitTags(getAny(record, ["tags", "标签", "tag"]));
    var id = cleanText(getAny(record, ["id", "ID", "流水号", "订单号", "交易号"]));
    var stableParts = [occurredAt, kind, amount, category, project, target, note, index].join("|");

    return {
      id: id || "import-" + hashCode(stableParts),
      kind: kind,
      amount: amount,
      category: category,
      project: project,
      target: target,
      settlement: pending ? "pending" : "none",
      settledAmount: settledAmount,
      settlementEvents: [],
      settledAt: pending && settledAmount >= amount ? (parseDateValue(getAny(record, ["settledAt", "结算时间", "还款时间"])) || nowIso) : "",
      investmentProfit: investmentProfit,
      closedAt: kind === "investment" ? (parseDateValue(getAny(record, ["closedAt", "平仓时间"])) || "") : "",
      occurredAt: occurredAt,
      note: note,
      tags: tags,
      createdAt: parseDateValue(getAny(record, ["createdAt", "创建时间"])) || nowIso,
      updatedAt: parseDateValue(getAny(record, ["updatedAt", "更新时间"])) || nowIso
    };
  }

  function inferKind(rawKind, amountValue, incomeValue, expenseValue) {
    var text = String(rawKind || "").toLowerCase();
    if (/理财|投资|买入|做空|investment|invest/.test(text)) {
      return "investment";
    }
    if (/支出|付款|还款|expense|pay/.test(text)) {
      return "expense";
    }
    if (/收入|收款|工资|income/.test(text)) {
      return "income";
    }
    if (expenseValue > 0) {
      return "expense";
    }
    if (incomeValue > 0) {
      return "income";
    }
    if (amountValue < 0) {
      return "expense";
    }
    return "income";
  }

  function getAny(record, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(record, keys[i]) && cleanText(record[keys[i]]) !== "") {
        return record[keys[i]];
      }
    }
    var lowerMap = {};
    Object.keys(record).forEach(function (key) {
      lowerMap[key.toLowerCase()] = key;
    });
    for (var j = 0; j < keys.length; j += 1) {
      var found = lowerMap[String(keys[j]).toLowerCase()];
      if (found && cleanText(record[found]) !== "") {
        return record[found];
      }
    }
    return "";
  }

  function clearAll() {
    leaveBatchMode();
    if (!state.records.length) {
      showToast("账本已经是空的。");
      return;
    }
    if (!window.confirm("确定清空所有本地账目吗？建议先导出 JSON 备份。")) {
      return;
    }
    localStorage.setItem(BACKUP_KEY, JSON.stringify({
      backedUpAt: new Date().toISOString(),
      records: state.records
    }));
    state.records = [];
    saveRecords();
    render();
    showToast("所有记录已清空，清空前数据已暂存为最近备份。");
  }

  function fillDatalists() {
    var kind = getSelectedKind();
    var categorySet = new Set(categoryDefaults[kind]);
    state.records.forEach(function (record) {
      if (record.kind === kind && record.category) {
        categorySet.add(record.category);
      }
    });
    els.categoryOptions.innerHTML = Array.from(categorySet).map(function (item) {
      return "<option value=\"" + escapeHtml(item) + "\"></option>";
    }).join("");

    var projectSet = new Set(projectDefaults);
    state.records.forEach(function (record) {
      if (record.project) {
        projectSet.add(record.project);
      }
    });
    els.projectOptions.innerHTML = Array.from(projectSet).map(function (item) {
      return "<option value=\"" + escapeHtml(item) + "\"></option>";
    }).join("");

    var currentProject = cleanText(els.investmentProject.value);
    var baseTargets = currentProject
      ? (targetDefaultsByProject[currentProject] || targetDefaultsByProject["其他"])
      : Object.keys(targetDefaultsByProject).reduce(function (items, key) {
          return items.concat(targetDefaultsByProject[key]);
        }, []);
    var targetSet = new Set(baseTargets);
    state.records.forEach(function (record) {
      if (record.target && (!currentProject || record.project === currentProject)) {
        targetSet.add(record.target);
      }
    });
    els.targetOptions.innerHTML = Array.from(targetSet).map(function (item) {
      return "<option value=\"" + escapeHtml(item) + "\"></option>";
    }).join("");
  }

  function openComboMenu(inputId) {
    var input = document.getElementById(inputId);
    var menu = document.querySelector("[data-combo-menu='" + inputId + "']");
    if (!input || !menu || input.disabled) {
      return;
    }
    var button = document.querySelector("[data-combo-for='" + inputId + "']");
    if (!menu.classList.contains("hidden")) {
      closeComboMenus();
      input.focus();
      return;
    }
    closeComboMenus();
    renderComboMenu(inputId);
    menu.classList.remove("hidden");
    if (button) {
      button.classList.add("open");
    }
    input.focus();
  }

  function renderOpenComboMenu(inputId) {
    var menu = document.querySelector("[data-combo-menu='" + inputId + "']");
    if (menu && !menu.classList.contains("hidden")) {
      renderComboMenu(inputId);
    }
  }

  function renderComboMenu(inputId) {
    var input = document.getElementById(inputId);
    var menu = document.querySelector("[data-combo-menu='" + inputId + "']");
    if (!input || !menu) {
      return;
    }
    var listId = input.getAttribute("data-combo-list") || input.getAttribute("list");
    var datalist = listId ? document.getElementById(listId) : null;
    var options = datalist ? Array.from(datalist.options).map(function (option) {
      return option.value;
    }).filter(Boolean) : [];
    var prefix = cleanText(input.value).toLowerCase();
    options = uniqueTags(options).filter(function (value) {
      return !prefix || cleanText(value).toLowerCase().indexOf(prefix) === 0;
    });
    if (!options.length) {
      menu.innerHTML = "<button type=\"button\" disabled>" + (prefix ? "暂无匹配项" : "暂无候选项") + "</button>";
    } else {
      menu.innerHTML = options.map(function (value) {
        return "<button type=\"button\" data-combo-value=\"" + escapeHtml(value) + "\">" + escapeHtml(value) + "</button>";
      }).join("");
    }
    menu.querySelectorAll("button[data-combo-value]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        input.value = button.getAttribute("data-combo-value");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        closeComboMenus();
        input.focus();
      });
    });
  }

  function closeComboMenus() {
    document.querySelectorAll(".combo-menu").forEach(function (menu) {
      menu.classList.add("hidden");
    });
    document.querySelectorAll(".combo-button.open").forEach(function (button) {
      button.classList.remove("open");
    });
  }

  function applyTheme(theme) {
    var value = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", value);
    if (els.themeIconSun && els.themeIconMoon) {
      els.themeIconSun.classList.toggle("hidden", value === "dark");
      els.themeIconMoon.classList.toggle("hidden", value !== "dark");
    }
    if (els.themeToggle) {
      els.themeToggle.title = value === "dark" ? "切换到白色主题" : "切换到黑色主题";
      els.themeToggle.setAttribute("aria-label", els.themeToggle.title);
    }
  }

  function getSelectedKind() {
    var selected = document.querySelector("input[name='kind']:checked");
    return selected ? selected.value : "expense";
  }

  function getSelectedInvestmentAction() {
    var selected = document.querySelector("input[name='investmentAction']:checked");
    return selected ? selected.value : "买入";
  }

  function setSelectedInvestmentAction(action) {
    var value = normalizeInvestmentAction(action);
    var node = document.querySelector("input[name='investmentAction'][value='" + value + "']");
    if (node) {
      node.checked = true;
    }
  }

  function normalizeInvestmentAction(action) {
    var value = cleanText(action);
    if (value === "做空") {
      return "做空";
    }
    return "买入";
  }

  function setSelectedKind(kind) {
    var normalized = normalizeKind(kind) || "expense";
    var node = document.querySelector("input[name='kind'][value='" + normalized + "']");
    if (node) {
      node.checked = true;
    }
  }

  function normalizeKind(value) {
    var text = String(value || "").toLowerCase();
    if (text === "income" || /收入/.test(text)) {
      return "income";
    }
    if (text === "investment" || /理财|投资/.test(text)) {
      return "investment";
    }
    if (text === "expense" || /支出/.test(text)) {
      return "expense";
    }
    return "";
  }

  function setNow(iso) {
    els.occurredAt.value = isoToLocalInput(iso || new Date().toISOString());
    els.occurredAt.disabled = els.useCurrentTime.checked;
  }

  function splitTags(text) {
    if (Array.isArray(text)) {
      return text.map(cleanText).filter(Boolean).slice(0, 12);
    }
    return String(text || "")
      .split(/[,，|]/)
      .map(cleanText)
      .filter(Boolean)
      .slice(0, 12);
  }

  function uniqueTags(tags) {
    var seen = new Set();
    return tags.map(cleanText).filter(function (tag) {
      if (!tag || seen.has(tag)) {
        return false;
      }
      seen.add(tag);
      return true;
    }).slice(0, 12);
  }

  function cleanText(text) {
    return String(text == null ? "" : text).trim().replace(/\s+/g, " ");
  }

  function parseMoney(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    var text = cleanText(value).replace(/,/g, "").replace(/[￥¥$]/g, "");
    if (!text) {
      return 0;
    }
    var negative = /^\(.*\)$/.test(text);
    text = text.replace(/[()]/g, "");
    var number = Number(text);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return negative ? -number : number;
  }

  function parseOptionalMoney(value) {
    var text = cleanText(value);
    if (!text) {
      return null;
    }
    return roundMoney(parseMoney(text));
  }

  function parseDateValue(value) {
    if (value == null || value === "") {
      return "";
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      var excelEpoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(excelEpoch.getTime() + value * 86400000).toISOString();
    }
    var text = cleanText(value).replace(/\//g, "-");
    var date = new Date(text);
    if (Number.isNaN(date.getTime()) && /^\d{4}-\d{1,2}-\d{1,2} /.test(text)) {
      date = new Date(text.replace(" ", "T"));
    }
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function localDateTimeToIso(value) {
    if (!value) {
      return "";
    }
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function isoToLocalInput(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
    var offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  function validIso(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function clampMoney(value, min, max) {
    return roundMoney(Math.max(min, Math.min(max, Number(value) || 0)));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY"
    }).format(Number(value) || 0);
  }

  function privateMoney(value) {
    return state.assetVisible ? formatMoney(value) : "******";
  }

  function signedMoney(value) {
    return (value >= 0 ? "+" : "-") + formatMoney(Math.abs(value));
  }

  function shortMoney(value) {
    if (value >= 10000) {
      return (value / 10000).toFixed(1) + "万";
    }
    return String(Math.round(value));
  }

  function formatShortDate(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit"
    }).format(value);
  }

  function formatYearMonth(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "2-digit",
      month: "2-digit"
    }).format(value);
  }

  function dateInputValue(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function formatTrendDate(ts) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(ts));
  }

  function formatDateTime(iso) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  }

  function kindLabel(kind) {
    if (kind === "income") {
      return "收入";
    }
    if (kind === "investment") {
      return "理财";
    }
    return "支出";
  }

  function createId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "rec-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function hashCode(text) {
    var hash = 0;
    var value = String(text);
    for (var i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function todayStamp() {
    var date = new Date();
    return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate());
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function csvCell(value) {
    return "\"" + String(value).replace(/"/g, "\"\"") + "\"";
  }

  function saveFile(filename, content, type) {
    if (window.showSaveFilePicker) {
      return window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: type.indexOf("csv") >= 0 ? "CSV 表格" : "JSON 文件",
          accept: type.indexOf("csv") >= 0 ? { "text/csv": [".csv"] } : { "application/json": [".json"] }
        }]
      })
        .then(function (handle) {
          return handle.createWritable();
        })
        .then(function (writable) {
          return writable.write(new Blob([content], { type: type }))
            .then(function () { return writable.close(); });
        })
        .then(function () {
          return true;
        })
        .catch(function (error) {
          if (error && error.name === "AbortError") {
            return false;
          }
          downloadFile(filename, content, type);
          return true;
        });
    }
    downloadFile(filename, content, type);
    return Promise.resolve(true);
  }

  function downloadFile(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = window.setTimeout(function () {
      els.toast.classList.remove("show");
    }, 2600);
  }
})();
