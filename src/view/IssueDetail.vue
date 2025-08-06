<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { $fetch } from '@/utils/fetch';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@/components/ui/toast';
import {
  ArrowLeft,
  MessageSquare,
  UserPlus,
  Lock,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Calendar,
  User,
  Clock,
  Send,
} from 'lucide-vue-next';

interface User {
  id: string;
  login: string;
  avatar_url: string;
  html_url: string;
  type: string;
}

interface Comment {
  id: string;
  user: User;
  created_at: string;
  updated_at: string;
  body: string;
  html_url: string;
}

interface Issue {
  id: string;
  url: string;
  number: number;
  state: "open" | "closed";
  title: string;
  body: string;
  user: User;
  assignee: User | null;
  assignees: User[];
  locked: boolean;
  repository_url: string;
  html_url: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  comments: number;
  milestone: any;
  labels: any[];
}

const route = useRoute();
const router = useRouter();
const { success, error: toastError } = useToast();

// 路由参数
const owner = computed(() => route.params.owner as string);
const repo = computed(() => route.params.repo as string);
const issueNumber = computed(() => parseInt(route.params.number as string));

// 状态管理
const loading = ref(false);
const commentsLoading = ref(false);
const error = ref<string | null>(null);
const issue = ref<Issue | null>(null);
const comments = ref<Comment[]>([]);

// 评论相关
const newComment = ref('');
const commentSubmitting = ref(false);

// 分配相关
const assignDialog = ref(false);
const availableAssignees = ref<User[]>([]);
const assigneesLoading = ref(false);

// 获取 issue 详情
const fetchIssue = async () => {
  if (!owner.value || !repo.value || !issueNumber.value) return;

  loading.value = true;
  error.value = null;

  try {
    const response = await $fetch(`/repos/${owner.value}/${repo.value}/issues/${issueNumber.value}`, {
      method: 'get'
    });

    if (response.success) {
      issue.value = response.data;
    } else {
      throw new Error(response.message || '获取 Issue 详情失败');
    }
  } catch (err) {
    console.error('获取 Issue 详情失败:', err);
    error.value = err instanceof Error ? err.message : '获取 Issue 详情失败';
  } finally {
    loading.value = false;
  }
};

// 获取评论列表
const fetchComments = async () => {
  if (!owner.value || !repo.value || !issueNumber.value) return;

  commentsLoading.value = true;

  try {
    const response = await $fetch(`/repos/${owner.value}/${repo.value}/issues/${issueNumber.value}/comments`, {
      method: 'get'
    });

    if (response.success && Array.isArray(response.data)) {
      comments.value = response.data;
    } else {
      comments.value = [];
    }
  } catch (err) {
    console.error('获取评论失败:', err);
    comments.value = [];
  } finally {
    commentsLoading.value = false;
  }
};

// 提交新评论
const submitComment = async () => {
  if (!newComment.value.trim() || !owner.value || !repo.value || !issueNumber.value) return;

  commentSubmitting.value = true;

  try {
    const response = await $fetch(`/repos/${owner.value}/${repo.value}/issues/${issueNumber.value}/comments`, {
      method: 'post',
      data: {
        body: newComment.value.trim()
      }
    });

    if (response.success) {
      success('评论提交成功');
      newComment.value = '';
      // 重新获取评论列表
      await fetchComments();
      // 更新 issue 的评论数
      if (issue.value) {
        issue.value.comments = (issue.value.comments || 0) + 1;
      }
    } else {
      throw new Error(response.message || '提交评论失败');
    }
  } catch (err) {
    console.error('提交评论失败:', err);
    toastError(err instanceof Error ? err.message : '提交评论失败');
  } finally {
    commentSubmitting.value = false;
  }
};

// 切换 issue 状态
const toggleIssueState = async () => {
  if (!issue.value || !owner.value || !repo.value || !issueNumber.value) return;

  const newState = issue.value.state === 'open' ? 'closed' : 'open';

  try {
    const response = await $fetch(`/repos/${owner.value}/${repo.value}/issues/${issueNumber.value}`, {
      method: 'patch',
      data: {
        state: newState
      }
    });

    if (response.success) {
      success(`Issue 已${newState === 'open' ? '重新打开' : '关闭'}`);
      issue.value.state = newState;
      if (newState === 'closed') {
        issue.value.closed_at = new Date().toISOString();
      } else {
        issue.value.closed_at = null;
      }
    } else {
      throw new Error(response.message || '操作失败');
    }
  } catch (err) {
    console.error('切换状态失败:', err);
    toastError(err instanceof Error ? err.message : '操作失败');
  }
};

// 获取可分配的用户列表
const fetchAssignees = async () => {
  if (!owner.value || !repo.value) return;

  assigneesLoading.value = true;

  try {
    const response = await $fetch(`/repos/${owner.value}/${repo.value}/assignees`, {
      method: 'get'
    });

    if (response.success && Array.isArray(response.data)) {
      availableAssignees.value = response.data;
    } else {
      availableAssignees.value = [];
    }
  } catch (err) {
    console.error('获取分配用户列表失败:', err);
    availableAssignees.value = [];
  } finally {
    assigneesLoading.value = false;
  }
};

// 分配用户
const assignUser = async (user: User) => {
  if (!owner.value || !repo.value || !issueNumber.value) return;

  try {
    const currentAssignees = issue.value?.assignees || [];
    const isAssigned = currentAssignees.some(assignee => assignee.id === user.id);

    if (isAssigned) {
      // 移除分配
      const response = await $fetch(`/repos/${owner.value}/${repo.value}/issues/${issueNumber.value}/assignees`, {
        method: 'delete',
        data: {
          assignees: [user.login]
        }
      });

      if (response.success) {
        success(`已取消分配给 ${user.login}`);
        if (issue.value) {
          issue.value.assignees = currentAssignees.filter(assignee => assignee.id !== user.id);
          if (issue.value.assignee && issue.value.assignee.id === user.id) {
            issue.value.assignee = issue.value.assignees[0] || null;
          }
        }
      }
    } else {
      // 添加分配
      const response = await $fetch(`/repos/${owner.value}/${repo.value}/issues/${issueNumber.value}/assignees`, {
        method: 'post',
        data: {
          assignees: [user.login]
        }
      });

      if (response.success) {
        success(`已分配给 ${user.login}`);
        if (issue.value) {
          issue.value.assignees = [...currentAssignees, user];
          if (!issue.value.assignee) {
            issue.value.assignee = user;
          }
        }
      }
    }
  } catch (err) {
    console.error('分配操作失败:', err);
    toastError(err instanceof Error ? err.message : '分配操作失败');
  }
};

// 格式化时间
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return '刚刚';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}分钟前`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}小时前`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
};

// 打开外部链接
const openExternalLink = async (url: string) => {
  try {
    await invoke('open_url', { url });
  } catch (error) {
    console.error('打开链接失败:', error);
  }
};

// 返回上一页
const goBack = () => {
  router.back();
};

// 组件挂载时获取数据
onMounted(async () => {
  await fetchIssue();
  await fetchComments();
});

// 监听路由参数变化
watch([owner, repo, issueNumber], async () => {
  if (owner.value && repo.value && issueNumber.value) {
    await fetchIssue();
    await fetchComments();
  }
});
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-4">
    <!-- 导航栏 -->
    <div class="mb-6">
      <div class="flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-3">
        <div class="flex items-center space-x-4">
          <Button variant="ghost" size="sm" @click="goBack" class="rounded-full p-2 hover:bg-muted/80 transition-all duration-200">
            <ArrowLeft class="w-4 h-4" />
          </Button>
          <div class="space-y-0.5">
            <h1 class="text-2xl font-bold text-foreground tracking-tight">Issue #{{ issueNumber }}</h1>
            <p class="text-sm text-muted-foreground font-medium">{{ owner }}/{{ repo }}</p>
          </div>
        </div>

        <div v-if="issue" class="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            @click="openExternalLink(issue.html_url)"
            title="在 GitHub 中查看"
            class="rounded-full hover:bg-muted/80 transition-all duration-200"
          >
            <ExternalLink class="w-4 h-4 mr-2" />
            在 GitHub 查看
          </Button>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-12 space-y-3">
      <div class="relative">
        <div class="animate-spin rounded-full h-10 w-10 border-4 border-muted border-t-primary"></div>
      </div>
      <div class="text-center space-y-1">
        <p class="text-base font-medium text-foreground">加载 Issue 详情</p>
        <p class="text-sm text-muted-foreground">请稍候...</p>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="text-center py-12 space-y-4">
      <div class="flex justify-center">
        <div class="rounded-full bg-destructive/10 p-3">
          <AlertCircle class="w-10 h-10 text-destructive" />
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="text-lg font-semibold text-foreground">无法加载 Issue</h3>
        <p class="text-muted-foreground max-w-md mx-auto leading-relaxed">{{ error }}</p>
      </div>
      <Button 
        variant="outline" 
        @click="fetchIssue"
        class="rounded-full px-6 hover:bg-muted/80 transition-all duration-200"
      >
        重新尝试
      </Button>
    </div>

    <!-- Issue 详情 -->
    <div v-else-if="issue" class="space-y-5">
      <!-- Issue 标题和状态 -->
      <div class="bg-gradient-to-br from-card via-card/95 to-muted/20 border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <div class="p-5 lg:p-6">
          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <!-- 主要内容区域 -->
            <div class="flex-1 min-w-0 space-y-3">
              <!-- Issue 标题 -->
              <div class="space-y-2">
                <h2 class="text-2xl lg:text-3xl font-bold text-foreground leading-tight break-words">
                  {{ issue.title }}
                </h2>
                
                <!-- 状态徽章 -->
                <div class="flex items-center flex-wrap gap-2">
                  <Badge 
                    :variant="issue.state === 'open' ? 'default' : 'secondary'"
                    class="px-3 py-1 text-sm font-medium rounded-full"
                  >
                    <CheckCircle v-if="issue.state === 'closed'" class="w-4 h-4 mr-2" />
                    <AlertCircle v-else class="w-4 h-4 mr-2" />
                    {{ issue.state === 'open' ? '进行中' : '已完成' }}
                  </Badge>
                  
                  <Badge v-if="issue.locked" variant="outline" class="px-3 py-1 text-sm rounded-full">
                    <Lock class="w-4 h-4 mr-2" />
                    已锁定
                  </Badge>
                </div>
              </div>
              
              <!-- 元信息网格 -->
              <div class="bg-muted/30 rounded-xl p-3 border border-border/30">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <!-- 创建者信息 -->
                  <div class="flex items-center space-x-2">
                    <div class="flex items-center space-x-1">
                      <User class="w-4 h-4 text-muted-foreground" />
                      <span class="text-muted-foreground">创建者</span>
                    </div>
                    <div class="flex items-center space-x-1 min-w-0">
                      <Avatar class="w-5 h-5 border">
                        <AvatarImage :src="issue.user.avatar_url" :alt="issue.user.login" />
                        <AvatarFallback class="text-xs">
                          {{ issue.user.login.charAt(0).toUpperCase() }}
                        </AvatarFallback>
                      </Avatar>
                      <button
                        class="text-foreground hover:text-primary transition-colors hover:underline font-medium truncate"
                        @click="openExternalLink(issue.user.html_url)"
                        :title="issue.user.login"
                      >
                        {{ issue.user.login }}
                      </button>
                    </div>
                  </div>

                  <!-- 创建时间 -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-1">
                      <Calendar class="w-4 h-4 text-muted-foreground" />
                      <span class="text-muted-foreground">创建于</span>
                    </div>
                    <span class="font-medium text-foreground" :title="new Date(issue.created_at).toLocaleString('zh-CN')">
                      {{ formatDate(issue.created_at) }}
                    </span>
                  </div>

                  <!-- 更新时间 -->
                  <div v-if="issue.updated_at !== issue.created_at" class="flex items-center justify-between">
                    <div class="flex items-center space-x-1">
                      <Clock class="w-4 h-4 text-muted-foreground" />
                      <span class="text-muted-foreground">更新于</span>
                    </div>
                    <span class="font-medium text-foreground" :title="new Date(issue.updated_at).toLocaleString('zh-CN')">
                      {{ formatDate(issue.updated_at) }}
                    </span>
                  </div>

                  <!-- 评论数量 -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-1">
                      <MessageSquare class="w-4 h-4 text-muted-foreground" />
                      <span class="text-muted-foreground">评论</span>
                    </div>
                    <span class="font-medium text-foreground">
                      {{ issue.comments || 0 }} 条
                    </span>
                  </div>
                </div>
              </div>

              <!-- 已分配用户（内嵌显示） -->
              <div v-if="issue.assignees && issue.assignees.length > 0" class="bg-muted/20 rounded-lg p-3 border border-border/20">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-muted-foreground flex items-center">
                    <UserPlus class="w-4 h-4 mr-1" />
                    已分配给
                  </span>
                  <div class="flex items-center -space-x-1">
                    <div
                      v-for="assignee in issue.assignees"
                      :key="assignee.id"
                      class="group relative"
                      @click="openExternalLink(assignee.html_url)"
                    >
                      <Avatar class="w-7 h-7 border-2 border-background hover:border-primary/50 transition-colors cursor-pointer">
                        <AvatarImage :src="assignee.avatar_url" :alt="assignee.login" />
                        <AvatarFallback class="text-xs font-medium">
                          {{ assignee.login.charAt(0).toUpperCase() }}
                        </AvatarFallback>
                      </Avatar>
                      <!-- 悬浮提示 -->
                      <div class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {{ assignee.login }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 操作按钮区域 -->
            <div class="flex flex-row lg:flex-col gap-2 lg:min-w-0 lg:w-auto">
              <Button
                :variant="issue.state === 'open' ? 'destructive' : 'default'"
                size="default"
                @click="toggleIssueState"
                class="flex-1 lg:flex-initial rounded-xl px-5 py-2 font-medium transition-all duration-200"
              >
                {{ issue.state === 'open' ? '关闭 Issue' : '重新打开' }}
              </Button>
              
              <Button
                variant="outline"
                size="default"
                @click="assignDialog = true; fetchAssignees()"
                class="flex-1 lg:flex-initial rounded-xl px-5 py-2 font-medium transition-all duration-200 hover:bg-muted/80"
              >
                <UserPlus class="w-4 h-4 mr-1" />
                分配用户
              </Button>
            </div>
          </div>
        </div>

        <!-- Issue 正文 -->
        <div v-if="issue.body" class="border-t border-border/50 bg-background/50 p-5 lg:p-6">
          <div class="prose max-w-none text-foreground leading-relaxed">
            <div class="whitespace-pre-wrap text-[15px] leading-7">{{ issue.body }}</div>
          </div>
        </div>
      </div>

      <!-- 评论区域 -->
      <div class="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <!-- 评论标题 -->
        <div class="bg-gradient-to-r from-muted/30 to-muted/10 px-5 py-3 border-b border-border/50">
          <h3 class="text-lg font-semibold text-foreground flex items-center">
            <MessageSquare class="w-5 h-5 mr-2 text-primary" />
            讨论区
            <span class="ml-auto bg-primary/10 text-primary text-sm font-medium px-2 py-1 rounded-full">
              {{ comments.length }} 条评论
            </span>
          </h3>
        </div>
        
        <div class="p-5 space-y-5">
          <!-- 评论列表 -->
          <div v-if="commentsLoading" class="flex flex-col items-center justify-center py-10 space-y-3">
            <div class="animate-spin rounded-full h-8 w-8 border-4 border-muted border-t-primary"></div>
            <p class="text-muted-foreground">加载讨论内容...</p>
          </div>

          <div v-else-if="comments.length === 0" class="text-center py-10 space-y-3">
            <div class="rounded-full bg-muted/30 p-3 w-14 h-14 mx-auto flex items-center justify-center">
              <MessageSquare class="w-7 h-7 text-muted-foreground" />
            </div>
            <div class="space-y-1">
              <h4 class="text-base font-medium text-foreground">还没有讨论</h4>
              <p class="text-muted-foreground">成为第一个发表看法的人</p>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="(comment, index) in comments"
              :key="comment.id"
              class="group relative"
            >
              <!-- 连接线 -->
              <div 
                v-if="index < comments.length - 1" 
                class="absolute left-6 top-14 w-0.5 h-full bg-border/30 group-hover:bg-border/50 transition-colors"
              ></div>
              
              <div class="flex items-start space-x-3 p-4 rounded-xl bg-gradient-to-br from-background via-background/95 to-muted/10 border border-border/30 hover:border-border/50 hover:shadow-sm transition-all duration-200">
                <!-- 头像 -->
                <Avatar class="w-10 h-10 border-2 border-background shadow-sm flex-shrink-0">
                  <AvatarImage :src="comment.user.avatar_url" :alt="comment.user.login" />
                  <AvatarFallback class="text-sm font-medium bg-gradient-to-br from-primary/20 to-primary/10">
                    {{ comment.user.login.charAt(0).toUpperCase() }}
                  </AvatarFallback>
                </Avatar>
                
                <div class="flex-1 min-w-0 space-y-2">
                  <!-- 评论头部 -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                      <button
                        class="font-semibold text-foreground hover:text-primary transition-colors hover:underline"
                        @click="openExternalLink(comment.user.html_url)"
                      >
                        {{ comment.user.login }}
                      </button>
                      <div class="flex items-center space-x-2 text-sm text-muted-foreground">
                        <time 
                          class="hover:text-foreground transition-colors cursor-help"
                          :title="new Date(comment.created_at).toLocaleString('zh-CN')"
                        >
                          {{ formatDate(comment.created_at) }}
                        </time>
                        <span v-if="comment.updated_at !== comment.created_at" class="flex items-center text-xs">
                          <Clock class="w-3 h-3 mr-1" />
                          已编辑
                        </span>
                      </div>
                    </div>
                    <!-- 评论操作按钮 -->
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      @click="openExternalLink(comment.html_url)"
                      class="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1.5"
                      title="在 GitHub 查看"
                    >
                      <ExternalLink class="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  
                  <!-- 评论内容 -->
                  <div class="bg-background/50 rounded-lg p-3 border border-border/20">
                    <div class="prose max-w-none text-foreground text-[14px] leading-6">
                      <div class="whitespace-pre-wrap">{{ comment.body }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 新评论表单 -->
          <div class="border-t border-border/50 pt-5 space-y-3">
            <div class="flex items-center space-x-2">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <Send class="w-3.5 h-3.5 text-primary" />
              </div>
              <h4 class="text-base font-semibold text-foreground">参与讨论</h4>
            </div>
            
            <div class="space-y-3 ml-9">
              <Textarea
                v-model="newComment"
                placeholder="分享你的想法、建议或问题..."
                rows="3"
                :disabled="commentSubmitting"
                class="resize-none rounded-xl border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-200"
              />
              <div class="flex justify-between items-center">
                <p class="text-xs text-muted-foreground">
                  支持 Markdown 格式
                </p>
                <Button
                  @click="submitComment"
                  :disabled="!newComment.trim() || commentSubmitting"
                  size="default"
                  class="rounded-xl px-5 py-2 font-medium transition-all duration-200"
                >
                  <Send v-if="!commentSubmitting" class="w-4 h-4 mr-2" />
                  <div v-else class="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                  {{ commentSubmitting ? '发布中...' : '发布评论' }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分配用户对话框 -->
    <Dialog v-model:open="assignDialog">
      <DialogContent class="max-w-2xl rounded-2xl">
        <DialogHeader class="space-y-3 pb-6 border-b border-border/50">
          <DialogTitle class="text-xl font-semibold text-foreground flex items-center">
            <div class="p-2 rounded-full bg-primary/10 mr-3">
              <UserPlus class="w-5 h-5 text-primary" />
            </div>
            管理分配用户
          </DialogTitle>
          <p class="text-sm text-muted-foreground">
            选择要分配或取消分配的用户
          </p>
        </DialogHeader>
        
        <div class="py-6 space-y-6">
          <!-- 加载状态 -->
          <div v-if="assigneesLoading" class="flex flex-col items-center justify-center py-12 space-y-4">
            <div class="animate-spin rounded-full h-10 w-10 border-4 border-muted border-t-primary"></div>
            <p class="text-muted-foreground">获取可分配用户...</p>
          </div>

          <!-- 无用户状态 -->
          <div v-else-if="availableAssignees.length === 0" class="text-center py-12 space-y-4">
            <div class="rounded-full bg-muted/30 p-4 w-16 h-16 mx-auto flex items-center justify-center">
              <UserPlus class="w-8 h-8 text-muted-foreground" />
            </div>
            <div class="space-y-2">
              <h4 class="text-lg font-medium text-foreground">没有可分配的用户</h4>
              <p class="text-muted-foreground">此仓库暂无可分配的协作者</p>
            </div>
          </div>

          <!-- 用户列表 -->
          <div v-else class="space-y-4">
            <!-- 搜索框 -->
            <div class="relative">
              <input
                type="text"
                placeholder="搜索用户..."
                class="w-full px-4 py-3 pl-10 bg-background border border-border/50 rounded-xl focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-200 text-foreground placeholder-muted-foreground"
              />
              <User class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            
            <!-- 用户网格 -->
            <div class="max-h-80 overflow-y-auto space-y-3 pr-2">
              <div
                v-for="user in availableAssignees"
                :key="user.id"
                class="group relative flex items-center justify-between p-4 rounded-xl border border-border/30 hover:border-border/60 hover:shadow-sm transition-all duration-200 cursor-pointer bg-gradient-to-br from-background via-background/95 to-muted/10"
                @click="assignUser(user)"
              >
                <div class="flex items-center space-x-4">
                  <Avatar class="w-12 h-12 border-2 border-border/30 group-hover:border-border/50 transition-colors">
                    <AvatarImage :src="user.avatar_url" :alt="user.login" />
                    <AvatarFallback class="text-sm font-medium bg-gradient-to-br from-primary/20 to-primary/10">
                      {{ user.login.charAt(0).toUpperCase() }}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div class="space-y-1">
                    <h4 class="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {{ user.login }}
                    </h4>
                    <p class="text-sm text-muted-foreground">
                      {{ user.type === 'User' ? '个人用户' : '组织账户' }}
                    </p>
                  </div>
                </div>
                
                <!-- 状态指示器 -->
                <div class="flex items-center space-x-3">
                  <Badge
                    v-if="issue?.assignees?.some(assignee => assignee.id === user.id)"
                    class="bg-primary/10 text-primary border-primary/20 px-3 py-1 rounded-full font-medium"
                  >
                    <CheckCircle class="w-3 h-3 mr-1" />
                    已分配
                  </Badge>
                  
                  <Button 
                    v-else 
                    variant="ghost" 
                    size="sm"
                    class="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-2 hover:bg-primary/10"
                  >
                    <UserPlus class="w-4 h-4 text-primary" />
                  </Button>
                  
                  <!-- 悬浮时显示的操作提示 -->
                  <div class="absolute right-4 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="text-xs text-muted-foreground">
                      {{issue?.assignees?.some(assignee => assignee.id === user.id) ? '点击取消分配' : '点击分配'}}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* 增强的 prose 样式 */
.prose {
  color: hsl(var(--foreground));
  line-height: 1.75;
}

.prose strong {
  color: hsl(var(--foreground));
  font-weight: 600;
}

.prose em {
  color: hsl(var(--foreground));
  font-style: italic;
}

.prose code {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.875em;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  border: 1px solid hsl(var(--border));
}

.prose pre {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
}

.prose pre code {
  background: none;
  border: none;
  padding: 0;
}

.prose a {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-decoration-color: hsl(var(--primary) / 0.3);
  transition: all 0.2s ease;
}

.prose a:hover {
  color: hsl(var(--primary));
  text-decoration-color: hsl(var(--primary));
  opacity: 0.9;
}

.prose blockquote {
  border-left: 4px solid hsl(var(--border));
  margin: 1.5rem 0;
  padding-left: 1rem;
  font-style: italic;
  color: hsl(var(--muted-foreground));
}

.prose ul,
.prose ol {
  margin: 1rem 0;
  padding-left: 1.5rem;
}

.prose li {
  margin: 0.5rem 0;
}

.prose h1,
.prose h2,
.prose h3,
.prose h4,
.prose h5,
.prose h6 {
  color: hsl(var(--foreground));
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  line-height: 1.25;
}

.prose h1 {
  font-size: 2rem;
}

.prose h2 {
  font-size: 1.5rem;
}

.prose h3 {
  font-size: 1.25rem;
}

/* 自定义滚动条样式 */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: hsl(var(--muted) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--border) / 0.8);
}

/* 渐变动画 */
@keyframes gradient-shift {

  0%,
  100% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }
}

/* 加载动画优化 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 悬浮效果增强 */
.hover-lift:hover {
  transform: translateY(-1px);
}

/* 焦点状态优化 */
.focus-ring:focus {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
}

/* 响应式间距调整 */
@media (max-width: 768px) {
  .responsive-padding {
    padding: 1rem;
  }

  .responsive-gap {
    gap: 0.75rem;
  }
}

/* 卡片阴影层次 */
.card-shadow {
  box-shadow:
    0 1px 3px 0 rgb(0 0 0 / 0.1),
    0 1px 2px -1px rgb(0 0 0 / 0.1);
}

.card-shadow:hover {
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
}
</style>