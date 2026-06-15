// ================================================================
// chrome.storage 封装
// ================================================================

const StorageKeys = {
  USER_PROFILES: 'moirca_user_profiles',
  PREFERENCES: 'moirca_preferences',
  EXPORT_HISTORY: 'moirca_export_history',
  LAST_STATE: 'moirca_last_state',
};

const Storage = {
  // --- 用户档案 ---
  async loadProfiles() {
    const result = await chrome.storage.local.get(StorageKeys.USER_PROFILES);
    return result[StorageKeys.USER_PROFILES] || [];
  },

  async saveProfiles(profiles) {
    await chrome.storage.local.set({ [StorageKeys.USER_PROFILES]: profiles });
  },

  async addProfile(profile) {
    const profiles = await this.loadProfiles();
    profile.id = 'prof_' + Date.now();
    profiles.push(profile);
    await this.saveProfiles(profiles);
    return profile;
  },

  async deleteProfile(profileId) {
    const profiles = await this.loadProfiles();
    await this.saveProfiles(profiles.filter((p) => p.id !== profileId));
  },

  // --- 偏好设置 ---
  async loadPrefs() {
    const result = await chrome.storage.local.get(StorageKeys.PREFERENCES);
    return result[StorageKeys.PREFERENCES] || { autoDetect: true, showPanel: true };
  },

  async savePrefs(prefs) {
    await chrome.storage.local.set({ [StorageKeys.PREFERENCES]: prefs });
  },

  // --- 导出历史 ---
  async loadExportHistory() {
    const result = await chrome.storage.local.get(StorageKeys.EXPORT_HISTORY);
    return result[StorageKeys.EXPORT_HISTORY] || [];
  },

  async addExportEntry(entry) {
    const history = await this.loadExportHistory();
    history.unshift({ ...entry, timestamp: Date.now() });
    if (history.length > 50) history.length = 50;
    await chrome.storage.local.set({ [StorageKeys.EXPORT_HISTORY]: history });
  },

  // --- 最后状态 ---
  async loadLastState() {
    const result = await chrome.storage.session.get(StorageKeys.LAST_STATE);
    return result[StorageKeys.LAST_STATE] || {};
  },

  async saveLastState(state) {
    await chrome.storage.session.set({ [StorageKeys.LAST_STATE]: state });
  },
};
