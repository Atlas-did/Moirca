# Moirca 脚本

## 1. moirca-auto-fill.user.js — 油猴脚本（Tampermonkey）

### 功能

- **一键填充**: 将 Moirca 推荐结果自动填入官方志愿填报系统
- **数据导出**: 一键导出填报数据为结构化 JSON（下载或复制到剪贴板）
- **页面读取**: 读取页面上已填写的志愿数据
- **跨省支持**: 通用框架，配置即可扩展到其他省份

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 打开 `moirca-auto-fill.user.js` 文件，复制全部内容
3. 点击 Tampermonkey 图标 → 「创建新脚本」→ 粘贴 → Ctrl+S 保存
4. 脚本会自动在匹配的网站上运行

### 使用

1. 先在 Moirca 应用中获得推荐结果，点击「导出给脚本」
2. 打开官方志愿填报系统（如广东: pg.eeagd.edu.cn/ks）
3. 页面右侧会出现「🔧 Moirca 填报助手」浮动面板
4. 点击「从 Moirca 导入」→ 粘贴数据
5. 点击「一键填充」→ 数据自动填入表单
6. 核对后自行点击「保存志愿」
7. 可随时「导出 JSON」或「复制到剪贴板」

### 扩展省份

编辑脚本中的 `PROVINCE_CONFIGS` 对象，添加新省份配置：

```javascript
zhejiang: {
  name: '浙江',
  matchPatterns: ['zjzs.net', '浙江省URL关键词'],
  selectors: {
    volunteerTable: {
      container: '表单容器选择器',
      rows: '行选择器',
      fields: {
        schoolCode: '院校代码input选择器',
        groupCode: '专业组代码input选择器',
        majorCodes: '专业代码input选择器',
        adjustment: '调剂选择器',
      },
    },
  },
  maxVolunteers: 80,  // 浙江最多80个
  majorsPerRow: 1,    // 浙江是专业+院校模式
},
```

### 安全承诺

- ❌ 不读取密码字段
- ❌ 不自动提交表单
- ❌ 不读取验证码
- ❌ 不向任何外部服务器发送数据
- ✅ 所有数据在本地处理

---

## 2. demo/guangdong-form.html — 广东模拟表单

独立 HTML 文件，用于在不具备真实系统访问权限时进行脚本开发测试。

浏览器直接打开即可预览广东志愿填报系统的模拟界面。

包含: 登录页 → 批次选择页 → 志愿填写页（45行 × 6专业 + 调剂选择）

---

## 3. 其他脚本

待扩展: 其他省份填报模拟表单、数据批量导入工具等。
