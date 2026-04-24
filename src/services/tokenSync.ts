import api from "@/api";
import { tokenLogger } from "@/utils/logger";

let syncEnabled = false;

export const setSyncEnabled = (enabled: boolean) => {
  syncEnabled = enabled;
  tokenLogger.info(`Token同步服务: ${enabled ? "已启用" : "已禁用"}`);
};

export const isSyncEnabled = () => syncEnabled;

export const tokenSyncService = {
  async loadTokensFromServer(): Promise<any[] | null> {
    if (!syncEnabled) {
      tokenLogger.debug("同步未启用，跳过从服务器加载Token");
      return null;
    }

    try {
      const response = await api.tokens.getAll();
      if (response.success && response.authorized) {
        tokenLogger.info(`从服务器加载了 ${response.data.tokens.length} 个Token`);
        return response.data.tokens;
      }
      return null;
    } catch (error) {
      tokenLogger.error("从服务器加载Token失败:", error);
      return null;
    }
  },

  async syncTokenToServer(token: any): Promise<boolean> {
    if (!syncEnabled) {
      tokenLogger.debug("同步未启用，跳过同步Token到服务器");
      return false;
    }

    try {
      const response = await api.tokens.add(token);
      if (response.success) {
        tokenLogger.debug(`Token已同步到服务器: ${token.name}`);
        return true;
      }
      return false;
    } catch (error) {
      tokenLogger.error("同步Token到服务器失败:", error);
      return false;
    }
  },

  async syncTokensToServer(tokens: any[]): Promise<boolean> {
    if (!syncEnabled) {
      tokenLogger.debug("同步未启用，跳过批量同步Token到服务器");
      return false;
    }

    try {
      const response = await api.tokens.batchAdd(tokens);
      if (response.success) {
        tokenLogger.info(`批量同步 ${tokens.length} 个Token到服务器成功`);
        return true;
      }
      return false;
    } catch (error) {
      tokenLogger.error("批量同步Token到服务器失败:", error);
      return false;
    }
  },

  async updateTokenOnServer(tokenId: string, tokenData: any): Promise<boolean> {
    if (!syncEnabled) {
      return false;
    }

    try {
      const response = await api.tokens.update(tokenId, tokenData);
      return response.success;
    } catch (error) {
      tokenLogger.error("更新服务器Token失败:", error);
      return false;
    }
  },

  async deleteTokenFromServer(tokenId: string): Promise<boolean> {
    if (!syncEnabled) {
      return false;
    }

    try {
      const response = await api.tokens.delete(tokenId);
      return response.success;
    } catch (error) {
      tokenLogger.error("从服务器删除Token失败:", error);
      return false;
    }
  },

  async clearTokensOnServer(): Promise<boolean> {
    if (!syncEnabled) {
      return false;
    }

    try {
      const response = await api.tokens.clear();
      return response.success;
    } catch (error) {
      tokenLogger.error("清除服务器Token失败:", error);
      return false;
    }
  },

  async loadGroupsFromServer(): Promise<any[] | null> {
    if (!syncEnabled) {
      return null;
    }

    try {
      const response = await api.tokens.getGroups();
      if (response.success) {
        tokenLogger.info(`从服务器加载了 ${response.data.groups.length} 个分组`);
        return response.data.groups;
      }
      return null;
    } catch (error) {
      tokenLogger.error("从服务器加载分组失败:", error);
      return null;
    }
  },

  async syncGroupToServer(group: any): Promise<boolean> {
    if (!syncEnabled) {
      return false;
    }

    try {
      const response = await api.tokens.addGroup(group);
      return response.success;
    } catch (error) {
      tokenLogger.error("同步分组到服务器失败:", error);
      return false;
    }
  },

  async syncGroupsToServer(groups: any[]): Promise<boolean> {
    if (!syncEnabled) {
      return false;
    }

    try {
      const response = await api.tokens.syncGroups(groups);
      return response.success;
    } catch (error) {
      tokenLogger.error("批量同步分组到服务器失败:", error);
      return false;
    }
  },

  async deleteGroupFromServer(groupId: string): Promise<boolean> {
    if (!syncEnabled) {
      return false;
    }

    try {
      const response = await api.tokens.deleteGroup(groupId);
      return response.success;
    } catch (error) {
      tokenLogger.error("从服务器删除分组失败:", error);
      return false;
    }
  },

  async loadConfigFromServer(): Promise<Record<string, any> | null> {
    if (!syncEnabled) {
      return null;
    }

    try {
      const response = await api.tokens.getConfig();
      if (response.success && response.data) {
        const parsedConfig: Record<string, any> = {};
        for (const [key, value] of Object.entries(response.data)) {
          if (typeof value === 'string') {
            try {
              parsedConfig[key] = JSON.parse(value);
            } catch {
              parsedConfig[key] = value;
            }
          } else {
            parsedConfig[key] = value;
          }
        }
        return parsedConfig;
      }
      return null;
    } catch (error) {
      tokenLogger.error("从服务器加载配置失败:", error);
      return null;
    }
  },

  async saveConfigToServer(config: Record<string, any>): Promise<boolean> {
    if (!syncEnabled) {
      return false;
    }

    try {
      const response = await api.tokens.saveConfig(config);
      return response.success;
    } catch (error) {
      tokenLogger.error("保存配置到服务器失败:", error);
      return false;
    }
  },
};

export default tokenSyncService;
