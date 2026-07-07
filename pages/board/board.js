// 概念板块列表页
const { api } = require('../../utils/api.js');

Page({
  data: {
    // 板块列表
    boards: [],
    // 筛选条件
    sortBy: 'changePct',
    // 加载状态
    loading: true,
    // 搜索关键词
    searchKey: '',
    // 行业/概念切换
    type: 'concept'         // concept / industry
  },

  onLoad() {
    this.loadBoards();
  },

  onShow() {
    if (this._shouldRefresh) {
      this.loadBoards();
      this._shouldRefresh = false;
    }
  },

  onPullDownRefresh() {
    this.loadBoards().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadBoards() {
    console.log('[板块页] 开始加载数据, type:', this.data.type);
    this.setData({ loading: true });
    try {
      let rawBoards;
      if (this.data.type === 'industry') {
        rawBoards = await api.getIndustryBoardsLocal(50);
      } else {
        rawBoards = await api.getConceptBoardsLocal(50);
      }
      console.log('[板块页] 本地数据:', rawBoards.length, '条');
      const boards = rawBoards.map(b => ({
        ...b,
        leaderCap: b.leaderChangePct,
        leaderStock: b.leaderName,
        changePctFmt: (b.changePct > 0 ? '+' : '') + Number(b.changePct || 0).toFixed(2) + '%'
      }));
      this.sortBoards(boards);
      this.setData({ boards });
      this.setData({ loading: false });
      
      console.log('[板块页] 后台刷新远程数据...');
      this.refreshRemoteBoards();
    } catch (err) {
      console.error('[板块页] 加载板块失败:', err);
      this.setData({ loading: false });
    }
  },
  
  async refreshRemoteBoards() {
    try {
      let rawBoards;
      if (this.data.type === 'industry') {
        rawBoards = await api.getIndustryBoards(50);
      } else {
        rawBoards = await api.getConceptBoards(50);
      }
      if (rawBoards && rawBoards.length > 0) {
        console.log('[板块页] 后台刷新成功:', rawBoards.length, '条');
        const boards = rawBoards.map(b => ({
          ...b,
          leaderCap: b.leaderChangePct,
          leaderStock: b.leaderName,
          changePctFmt: (b.changePct > 0 ? '+' : '') + Number(b.changePct || 0).toFixed(2) + '%'
        }));
        this.sortBoards(boards);
        this.setData({ boards });
      }
    } catch (err) {
      console.warn('[板块页] 后台刷新失败:', err);
    }
  },

  // 切换概念/行业
  switchType(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.type) return;
    this.setData({ type });
    this.loadBoards();
  },

  // 排序板块
  sortBoards(boards) {
    const { sortBy } = this.data;
    boards.sort((a, b) => {
      if (sortBy === 'changePct') {
        return b.changePct - a.changePct;
      } else if (sortBy === 'marketCap') {
        return b.totalCap - a.totalCap;
      } else if (sortBy === 'stockCount') {
        return b.stockCount - a.stockCount;
      }
      return 0;
    });
  },

  // 切换排序方式
  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort;
    this.setData({ sortBy });
    const boards = [...this.data.boards];
    this.sortBoards(boards);
    this.setData({ boards });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value });
  },

  // 搜索（支持搜索股票名称/代码）
  async onSearch() {
    const { searchKey } = this.data;
    if (!searchKey) {
      this.loadBoards();
      return;
    }
    
    try {
      const results = await api.searchStock(searchKey);
      if (results && results.length > 0) {
        const stockResults = results.map(s => ({
          code: s.code,
          name: s.name,
          changePct: s.changePct,
          changePctFmt: s.changePct != null 
            ? (s.changePct > 0 ? '+' : '') + Number(s.changePct).toFixed(2) + '%'
            : '--',
          leaderStock: s.name,
          leaderCap: s.changePct
        }));
        this.setData({ boards: stockResults });
      } else {
        const filtered = [...this.data.boards].filter(b => b.name.includes(searchKey));
        this.setData({ boards: filtered });
      }
    } catch (err) {
      console.error('搜索失败:', err);
      const filtered = [...this.data.boards].filter(b => b.name.includes(searchKey));
      this.setData({ boards: filtered });
    }
  },

  // 跳转到板块详情
  goToBoardDetail(e) {
    const { code, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/board-detail/board-detail?code=${code}&name=${encodeURIComponent(name || '')}`
    });
  }
});