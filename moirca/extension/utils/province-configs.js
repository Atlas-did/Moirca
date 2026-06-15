// ================================================================
// 省份配置映射（7省全覆盖）
// 供 content script 和 popup 共用
// ================================================================

const PROVINCE_CONFIGS = {
  guangdong: {
    name: '广东',
    matchPatterns: ['pg.eeagd.edu.cn', 'eea.gd.gov.cn', 'localhost', '127.0.0.1'],
    model: 'school_group', // 院校专业组
    maxVolunteers: 45,
    majorsPerRow: 6,
    selectors: {
      loginForm: {
        studentId: 'input[name="ksh"], input[name="yhzh"], #ksh',
        password: 'input[type="password"]',
        captcha: 'input[name="captcha"], #captcha_input',
        submitBtn: 'button[type="submit"], input[type="submit"]',
      },
      volunteerTable: {
        container: 'table, form table, .volunteer-table, #fillTable',
        rows: 'tbody tr, .volunteer-row, tr[data-row]',
        fields: {
          schoolCode: 'input[name*="yxdh"], input[id*="yxdh"]',
          groupCode: 'input[name*="zydh"], input[id*="zydh"]',
          majorCodes: 'input[name*="zy"], input[id*="zy"]',
          adjustment: 'select[name*="tj"], input[type="radio"][name*="tj"]',
        },
      },
    },
  },

  zhejiang: {
    name: '浙江',
    matchPatterns: ['zjzs.net', 'zjzsfz.cn'],
    model: 'major_school', // 专业+院校（无调剂）
    maxVolunteers: 80,
    majorsPerRow: 1,
    selectors: {
      volunteerTable: {
        container: 'table, form table, .volunteer-table',
        rows: 'tbody tr, .volunteer-row',
        fields: {
          schoolCode: 'input[name*="yxdh"], input[id*="yxdh"], input[name*="school"]',
          majorCode: 'input[name*="zydh"], input[id*="zydh"], input[name*="major"]',
        },
      },
    },
  },

  shandong: {
    name: '山东',
    matchPatterns: ['wsbm.sdzk.cn', 'sdzk.cn'],
    model: 'major_school', // 专业（类）+院校（无调剂）
    maxVolunteers: 96,
    majorsPerRow: 1,
    selectors: {
      volunteerTable: {
        container: 'table, form table, .volunteer-table',
        rows: 'tbody tr, .volunteer-row',
        fields: {
          schoolCode: 'input[name*="yxdh"], input[id*="yxdh"]',
          majorCode: 'input[name*="zydh"], input[id*="zydh"]',
        },
      },
    },
  },

  jiangsu: {
    name: '江苏',
    matchPatterns: ['gk.jseea.cn', 'jseea.cn'],
    model: 'school_group', // 院校专业组
    maxVolunteers: 40,
    majorsPerRow: 6,
    selectors: {
      volunteerTable: {
        container: 'table, form table, .volunteer-table',
        rows: 'tbody tr, .volunteer-row',
        fields: {
          schoolCode: 'input[name*="yxdh"], input[id*="yxdh"]',
          groupCode: 'input[name*="zydh"], input[id*="zydh"]',
          majorCodes: 'input[name*="zy"], input[id*="zy"]',
          adjustment: 'select[name*="tj"], input[type="radio"][name*="tj"]',
        },
      },
    },
  },

  henan: {
    name: '河南',
    matchPatterns: ['pzwb.haeea.cn', 'haeea.cn'],
    model: 'school_group', // 院校专业组
    maxVolunteers: 48,
    majorsPerRow: 6,
    selectors: {
      volunteerTable: {
        container: 'table, form table, .volunteer-table',
        rows: 'tbody tr, .volunteer-row',
        fields: {
          schoolCode: 'input[name*="yxdh"], input[id*="yxdh"]',
          groupCode: 'input[name*="zydh"], input[id*="zydh"]',
          majorCodes: 'input[name*="zy"], input[id*="zy"]',
          adjustment: 'select[name*="tj"], input[type="radio"][name*="tj"]',
        },
      },
    },
  },

  sichuan: {
    name: '四川',
    matchPatterns: ['gkzy.sceea.cn', 'sceea.cn'],
    model: 'school_group', // 院校专业组
    maxVolunteers: 45,
    majorsPerRow: 6,
    selectors: {
      volunteerTable: {
        container: 'table, form table, .volunteer-table',
        rows: 'tbody tr, .volunteer-row',
        fields: {
          schoolCode: 'input[name*="yxdh"], input[id*="yxdh"]',
          groupCode: 'input[name*="zydh"], input[id*="zydh"]',
          majorCodes: 'input[name*="zy"], input[id*="zy"]',
          adjustment: 'select[name*="tj"], input[type="radio"][name*="tj"]',
        },
      },
    },
  },

  hubei: {
    name: '湖北',
    matchPatterns: ['zspt.hubzs.com.cn', 'zsxxw.e21.cn', 'hbea.edu.cn'],
    model: 'school_group', // 院校专业组
    maxVolunteers: 45,
    majorsPerRow: 6,
    selectors: {
      volunteerTable: {
        container: 'table, form table, .volunteer-table',
        rows: 'tbody tr, .volunteer-row',
        fields: {
          schoolCode: 'input[name*="yxdh"], input[id*="yxdh"]',
          groupCode: 'input[name*="zydh"], input[id*="zydh"]',
          majorCodes: 'input[name*="zy"], input[id*="zy"]',
          adjustment: 'select[name*="tj"], input[type="radio"][name*="tj"]',
        },
      },
    },
  },
};

// Common selector patterns for auto-detection
const COMMON_SELECTORS = {
  schoolCodePatterns: [
    'input[name*="yxdh"]', 'input[id*="yxdh"]',
    'input[name*="school"]', 'input[id*="school"]',
    'input[name*="yxd"]', 'input[placeholder*="院校"]',
    'input[placeholder*="学校"]',
  ],
  majorCodePatterns: [
    'input[name*="zydh"]', 'input[id*="zydh"]',
    'input[name*="major"]', 'input[id*="major"]',
    'input[name*="zy"]', 'input[placeholder*="专业"]',
  ],
  adjustmentPatterns: [
    'select[name*="tj"]', 'input[type="radio"][name*="tj"]',
    'select[name*="adjust"]',
  ],
};

// Detect province from URL
function detectProvince(url) {
  const host = (url || location.hostname).toLowerCase();
  for (const [key, cfg] of Object.entries(PROVINCE_CONFIGS)) {
    if (cfg.matchPatterns.some((p) => host.includes(p.toLowerCase()))) {
      return { key, config: cfg };
    }
  }
  return null;
}
