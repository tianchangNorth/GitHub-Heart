<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { invoke } from '@tauri-apps/api/core'
import {
  notifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  initializeNotifications,
  type Notification
} from '@/services/notificationService';
import { onMounted } from 'vue';

// 根据 GitHub API 的通知类型和原因获取通知类型
const getNotificationType = (notification: Notification): string => {
  const subjectType = notification.subject.type.toLowerCase();
  const reason = notification.reason.toLowerCase();

  if (subjectType === 'issue') {
    return 'issue';
  } else if (subjectType === 'pullrequest') {
    return 'pr';
  } else if (reason === 'mention' || reason === 'team_mention') {
    return 'mention';
  } else if (reason === 'assign' || reason === 'review_requested') {
    return 'assign';
  } else if (reason === 'subscribed' || reason === 'author') {
    return 'activity';
  }
  return 'system';
};

const getNotificationBadgeVariant = (notification: Notification): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const type = getNotificationType(notification);
  const variants = {
    issue: 'destructive' as const,
    pr: 'default' as const,
    mention: 'secondary' as const,
    assign: 'default' as const,
    activity: 'outline' as const,
    system: 'outline' as const
  };
  return variants[type as keyof typeof variants] || variants.system;
};

const getNotificationTypeText = (notification: Notification) => {
  const type = getNotificationType(notification);
  const texts = {
    issue: 'Issue',
    pr: 'Pull Request',
    mention: '提及',
    assign: '分配',
    activity: '活动',
    system: '系统通知'
  };
  return texts[type as keyof typeof texts] || '通知';
};

// 根据通知原因获取描述文本
const getReasonText = (reason: string): string => {
  const reasonTexts: Record<string, string> = {
    'approval_requested': '请求审批',
    'assign': '被分配',
    'author': '你创建的',
    'comment': '新评论',
    'ci_activity': 'CI 活动',
    'invitation': '邀请',
    'manual': '手动订阅',
    'member_feature_requested': '功能请求',
    'mention': '提及了你',
    'review_requested': '请求审查',
    'security_alert': '安全警告',
    'security_advisory_credit': '安全建议',
    'state_change': '状态变更',
    'subscribed': '订阅的仓库',
    'team_mention': '团队提及'
  };
  return reasonTexts[reason] || reason;
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) {
    return '刚刚';
  } else if (minutes < 60) {
    return `${minutes}分钟前`;
  } else if (hours < 24) {
    return `${hours}小时前`;
  } else if (days < 7) {
    return `${days}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
};

// 生成通知内容描述
const getNotificationContent = (notification: Notification): string => {
  const reasonText = getReasonText(notification.reason);
  const repoName = notification.repository.name;
  const subjectTitle = notification.subject.title;

  return `在 ${repoName} 中，${reasonText}：${subjectTitle}`;
};

// fetchNotifications 现在在服务中

// 所有函数现在都在服务中，直接使用导入的函数
const handleNotificationClick = (notification: Notification) => {
  // 点击通知时自动标记为已读
  if (notification.unread) {
    markAsRead(notification.id);
  }

  // 跳转到通知对应的页面
  if (notification.subject.url) {
    console.log('跳转到:', notification.subject.url);
    // 打开 GitHub 页面
    openUrl(notification.repository.html_url);
  }
};

const openUrl = async (url: string) => {
  try {
    await invoke('open_url', { url });
  } catch (error) {
    console.error('打开链接失败:', error);
  }
};

onMounted(()=>{
  initializeNotifications()
})
</script>

<template>
  <Card class="w-80 h-[790px] flex flex-col overflow-hidden shadow-lg gap-0">
    <!-- 通知头部 -->
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <g transform="translate(2, 2)">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
              </g>
            </svg>
          </div>
          <div>
            <CardTitle class="text-lg">通知</CardTitle>
            <CardDescription class="text-xs">
              {{ unreadCount > 0 ? `${unreadCount} 条未读消息` : '暂无未读消息' }}
            </CardDescription>
          </div>
        </div>

        <div class="flex items-center space-x-1">
          <Button
            v-if="unreadCount > 0"
            variant="ghost"
            size="sm"
            @click="markAllAsRead"
            class="text-xs h-8 px-2"
          >
            全部已读
          </Button>
          <Button
            variant="ghost"
            size="sm"
            @click="$emit('close')"
            class="h-8 w-8 p-0"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </Button>
        </div>
      </div>
    </CardHeader>

    <!-- 通知列表 -->
    <CardContent class="flex-1 overflow-hidden p-0">
      <div class="h-full overflow-y-auto">
        <!-- 空状态 -->
        <div v-if="notifications.length === 0" class="flex flex-col items-center justify-center h-full p-6 text-center">
          <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5zM11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
            </svg>
          </div>
          <h3 class="text-sm font-medium text-foreground mb-1">暂无通知</h3>
          <p class="text-xs text-muted-foreground">当有新的活动时，通知会显示在这里</p>
        </div>

        <!-- 通知列表 -->
        <div v-else class="divide-y divide-border">
          <div
            v-for="notification in notifications"
            :key="notification.id"
            class="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
            @click="handleNotificationClick(notification)"
          >
            <div class="flex items-start space-x-3">
              <!-- 仓库头像 -->
              <Avatar size="sm" class="flex-shrink-0">
                <AvatarImage
                  :src="notification.repository.owner.avatar_url"
                  :alt="notification.repository.owner.login"
                />
                <AvatarFallback class="text-xs">
                  {{ notification.repository.owner.login.charAt(0).toUpperCase() }}
                </AvatarFallback>
              </Avatar>

              <!-- 通知内容 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between mb-1">
                  <div class="flex items-center space-x-2 flex-1">
                    <span class="text-sm font-medium text-foreground">
                      {{ notification.repository.full_name }}
                    </span>
                    <div v-if="notification.unread" class="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                  <span class="text-xs text-muted-foreground flex-shrink-0">
                    {{ formatTime(notification.updated_at) }}
                  </span>
                </div>

                <!-- 通知内容 -->
                <div class="text-sm text-foreground line-clamp-3 mb-2">
                  {{ getNotificationContent(notification) }}
                </div>

                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-2">
                    <Badge
                      :variant="getNotificationBadgeVariant(notification)"
                      class="text-xs"
                    >
                      {{ getNotificationTypeText(notification) }}
                    </Badge>
                    <div
                      v-if="notification.repository.html_url"
                      class="text-xs text-muted-foreground hover:text-primary transition-colors"
                      @click.stop="openUrl(notification.repository.html_url)"
                    >
                      查看详情
                  </div>
                  </div>

                  <!-- 操作按钮 -->
                  <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      v-if="notification.unread"
                      variant="ghost"
                      size="sm"
                      @click.stop="markAsRead(notification.id)"
                      class="h-6 w-6 p-0"
                      title="标记为已读"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click.stop="dismissNotification(notification.id)"
                      class="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      title="删除通知"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
    
  </Card>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 通知内容中的HTML样式 */
.line-clamp-3 :deep(a) {
  color: hsl(var(--primary));
  text-decoration: none;
}

.line-clamp-3 :deep(a:hover) {
  text-decoration: underline;
}

.line-clamp-3 :deep(strong) {
  font-weight: 600;
}

.line-clamp-3 :deep(em) {
  font-style: italic;
}

.line-clamp-3 :deep(code) {
  background-color: hsl(var(--muted));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
}
</style>