import { ref, computed } from 'vue';
import { $fetch } from '@/utils/fetch';

// GitHub 通知数据结构（基于 GitHub REST API）
export interface Notification {
  id: string;                    // 通知唯一标识
  unread: boolean;               // 是否未读
  updated_at: string;            // 更新时间
  last_read_at?: string;         // 最后阅读时间
  url: string;                   // API地址
  subscription_url: string;      // 订阅地址
  reason: string;                // 通知原因
  repository: {                  // 仓库信息
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    owner: {
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
    };
  };
  subject: {                     // 主题信息
    title: string;
    url: string;
    latest_comment_url?: string;
    type: string;                // Issue, PullRequest, Commit 等
  };
}

// 全局通知状态
const notifications = ref<Notification[]>([]);
const loading = ref(false);
const hasMore = ref(false);
const initialized = ref(false);

// 计算未读数量
export const unreadCount = computed(() => {
  return notifications.value.filter(n => n.unread).length;
});

// 获取通知数据（使用 GitHub REST API）
export const fetchNotifications = async (all: boolean = false, participating: boolean = false) => {
  if (loading.value) return;

  try {
    loading.value = true;

    // 构建查询参数
    const params = new URLSearchParams({
      per_page: '50',
      all: all.toString(),
      participating: participating.toString()
    });

    // 使用 GitHub API 完整 URL
    const response = await $fetch(`https://api.github.com/notifications?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
      }
    });

    if (response.success && Array.isArray(response.data)) {
      notifications.value = response.data;
      // GitHub API 通过 Link header 提供分页信息，这里简化处理
      hasMore.value = response.data.length === 50;
      console.log('获取通知成功:', response.data);
    } else {
      notifications.value = [];
      hasMore.value = false;
    }
  } catch (error) {
    console.error('获取通知失败:', error);
    notifications.value = [];
    hasMore.value = false;
  } finally {
    loading.value = false;
    initialized.value = true;
  }
};

// 标记单个通知为已读（使用 GitHub REST API）
export const markAsRead = async (threadId: string) => {
  try {
    const response = await $fetch(`https://api.github.com/notifications/threads/${threadId}`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/vnd.github+json',
      }
    });

    if (response.success) {
      const notification = notifications.value.find(n => n.id === threadId);
      if (notification) {
        notification.unread = false;
        notification.last_read_at = new Date().toISOString();
      }
    }
  } catch (error) {
    console.error('标记已读失败:', error);
    // 本地更新作为降级处理
    const notification = notifications.value.find(n => n.id === threadId);
    if (notification) {
      notification.unread = false;
      notification.last_read_at = new Date().toISOString();
    }
  }
};

// 标记所有通知为已读（使用 GitHub REST API）
export const markAllAsRead = async () => {
  try {
    const response = await $fetch('https://api.github.com/notifications', {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
      },
      data: {
        read: true
      }
    });

    if (response.success) {
      const now = new Date().toISOString();
      notifications.value.forEach(n => {
        n.unread = false;
        n.last_read_at = now;
      });
    }
  } catch (error) {
    console.error('全部标记已读失败:', error);
    // 本地更新作为降级处理
    const now = new Date().toISOString();
    notifications.value.forEach(n => {
      n.unread = false;
      n.last_read_at = now;
    });
  }
};

// 标记通知为完成（GitHub API 中的 "done" 状态）
export const dismissNotification = async (threadId: string) => {
  try {
    const response = await $fetch(`https://api.github.com/notifications/threads/${threadId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/vnd.github+json',
      }
    });

    if (response.success) {
      const index = notifications.value.findIndex(n => n.id === threadId);
      if (index > -1) {
        notifications.value.splice(index, 1);
      }
    }
  } catch (error) {
    console.error('标记通知为完成失败:', error);
    // 本地删除作为降级处理
    const index = notifications.value.findIndex(n => n.id === threadId);
    if (index > -1) {
      notifications.value.splice(index, 1);
    }
  }
};

// 清空所有通知（本地操作，GitHub API 不提供批量删除）
export const clearAllNotifications = async () => {
  try {
    // GitHub API 不提供批量删除通知的接口
    // 这里只进行本地清空，实际应用中可能需要逐个标记为完成
    notifications.value = [];
    console.log('本地清空所有通知');
  } catch (error) {
    console.error('清空通知失败:', error);
    notifications.value = [];
  }
};

// 刷新通知
export const refreshNotifications = (all: boolean = false, participating: boolean = false) => {
  fetchNotifications(all, participating);
};

// 获取单个通知详情
export const getNotificationThread = async (threadId: string) => {
  try {
    const response = await $fetch(`https://api.github.com/notifications/threads/${threadId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (response.success) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error('获取通知详情失败:', error);
    return null;
  }
};

// 设置通知订阅状态
export const setThreadSubscription = async (threadId: string, ignored: boolean = false) => {
  try {
    const response = await $fetch(`https://api.github.com/notifications/threads/${threadId}/subscription`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      data: {
        ignored
      }
    });

    return response.success;
  } catch (error) {
    console.error('设置订阅状态失败:', error);
    return false;
  }
};

// 初始化通知服务
export const initializeNotifications = () => {
  if (!initialized.value) {
    fetchNotifications();
  }
};

// 导出状态
export {
  notifications,
  loading,
  hasMore,
  initialized
};
