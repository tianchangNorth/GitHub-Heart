import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Repository,
  RepositoryStats,
  Branch,
  FileTreeItem,
  ReadmeFile,
  RepositoryLanguages,
  Contributor,
  Tag,
  Release
} from '@/types/repository';
import { $fetch } from '@/utils/fetch';

export const useRepositoryStore = defineStore('repository', () => {
  // 状态
  const currentRepository = ref<Repository | null>(null);
  const repositoryStats = ref<RepositoryStats | null>(null);
  const branches = ref<Branch[]>([]);
  const currentBranch = ref<string>('');
  const fileTree = ref<FileTreeItem[]>([]);
  const currentPath = ref<string>('');
  const readme = ref<ReadmeFile | null>(null);
  const languages = ref<RepositoryLanguages>({});
  const contributors = ref<Contributor[]>([]);
  const tags = ref<Tag[]>([]);
  const latestRelease = ref<Release | null>(null);

  // 加载状态
  const loading = ref(false);
  const branchesLoading = ref(false);
  const fileTreeLoading = ref(false);
  const readmeLoading = ref(false);
  const error = ref<string | null>(null);

  // 计算属性
  const isRepositoryLoaded = computed(() => currentRepository.value !== null);
  const defaultBranch = computed(() => currentRepository.value?.default_branch || 'main');
  const repositoryFullName = computed(() => currentRepository.value?.full_name || '');
  const isPrivateRepository = computed(() => currentRepository.value?.private || false);

  // 主要编程语言
  const primaryLanguage = computed(() => {
    if (!languages.value || Object.keys(languages.value).length === 0) {
      return null;
    }

    const sortedLanguages = Object.entries(languages.value)
      .sort(([, a], [, b]) => b - a);

    return sortedLanguages[0]?.[0] || null;
  });

  // 语言统计百分比
  const languageStats = computed(() => {
    if (!languages.value || Object.keys(languages.value).length === 0) {
      return [];
    }

    const total = Object.values(languages.value).reduce((sum, bytes) => sum + bytes, 0);

    return Object.entries(languages.value)
      .map(([language, bytes]) => ({
        language,
        bytes,
        percentage: Math.round((bytes / total) * 100 * 100) / 100
      }))
      .sort((a, b) => b.bytes - a.bytes);
  });

  // 文件树扁平化（用于搜索）
  const flatFileTree = computed(() => {
    const flatten = (items: FileTreeItem[], parentPath = ''): FileTreeItem[] => {
      const result: FileTreeItem[] = [];

      for (const item of items) {
        const fullPath = parentPath ? `${parentPath}/${item.path}` : item.path;
        result.push({ ...item, path: fullPath });

        if (item.children && item.children.length > 0) {
          result.push(...flatten(item.children, fullPath));
        }
      }

      return result;
    };

    return flatten(fileTree.value);
  });

  // Actions
  const resetState = () => {
    currentRepository.value = null;
    repositoryStats.value = null;
    branches.value = [];
    currentBranch.value = '';
    fileTree.value = [];
    currentPath.value = '';
    readme.value = null;
    languages.value = {};
    contributors.value = [];
    tags.value = [];
    latestRelease.value = null;
    error.value = null;
  };

  // 获取仓库详情
  const fetchRepository = async (owner: string, repo: string) => {
    loading.value = true;
    error.value = null;

    try {
      const response = await $fetch(`/repos/${owner}/${repo}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github+json'
        }
      });

      if (response.success && response.data) {
        currentRepository.value = response.data;
        currentBranch.value = response.data.default_branch;
        return { success: true, data: response.data };
      } else {
        throw new Error('获取仓库信息失败');
      }
    } catch (err) {
      console.error('获取仓库详情失败:', err);
      error.value = err instanceof Error ? err.message : '获取仓库详情失败';
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  };

  // 获取仓库统计信息
  // const fetchRepositoryStats = async (owner: string, repo: string) => {
  //   try {
  //     const { success, data } = await $fetch(`/repos/${owner}/${repo}/stats`, {
  //       method: 'get'
  //     });

  //     if (success && data) {
  //       repositoryStats.value = data;
  //       return { success: true, data };
  //     }
  //   } catch (err) {
  //     console.error('获取仓库统计失败:', err);
  //   }

  //   // 如果获取失败，保持为 null，组件会显示空状态
  //   return { success: false };
  // };

  // 获取分支列表
  const fetchBranches = async (owner: string, repo: string) => {
    branchesLoading.value = true;

    try {
      const response = await $fetch(`/repos/${owner}/${repo}/branches`, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github+json'
        }
      });

      if (response.success && Array.isArray(response.data)) {
        branches.value = response.data;
        return { success: true, data: response.data };
      }
    } catch (err) {
      console.error('获取分支列表失败:', err);
    } finally {
      branchesLoading.value = false;
    }

    // 如果获取失败，设置为空数组，组件会显示空状态
    branches.value = [];
    return { success: false };
  };

  // 获取文件树
  const fetchFileTree = async (owner: string, repo: string, commitSha?: string, path = '') => {
    fileTreeLoading.value = true;

    try {
      // 如果没有提供 commitSha，则从当前分支获取
      let shaParam = commitSha;
      if (!shaParam && currentBranch.value) {
        const currentBranchInfo = branches.value.find(b => b.name === currentBranch.value);
        shaParam = currentBranchInfo?.commit.sha;
      }

      // 如果还是没有 SHA，使用默认分支名称作为后备
      const treeRef = shaParam || currentBranch.value || defaultBranch.value;

      // 添加 recursive=1 参数以获取完整的文件树，并处理可能的 404 错误
      const url = `/repos/${owner}/${repo}/git/trees/${treeRef}?recursive=1`;

      const response = await $fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github+json'
        }
      });

      if (response.success && response.data && Array.isArray(response.data.tree)) {
        const treeData = response.data.tree;

        // 只获取根目录的文件和文件夹
        const rootItems = treeData.filter((item: any) => {
          // 根目录项目不包含 '/' 或者只有一级路径
          return !item.path.includes('/') || (path && item.path.startsWith(path + '/'));
        });

        if (path === '') {
          // 根目录，直接设置
          fileTree.value = rootItems.map((item: { type: string; path: string; }) => ({
            ...item,
            name: item.path.split('/').pop() || item.path, // 提取文件名
            expanded: false,
            loading: false,
            children: item.type === 'tree' ? [] : undefined
          }));
        } else {
          // 子目录，需要更新对应的节点
          updateFileTreeNode(path, rootItems);
        }

        currentPath.value = path;
        return { success: true, data: rootItems };
      }
    } catch (err) {
      console.error('获取文件树失败:', err);

      // 如果是 404 错误，可能是空仓库或者分支不存在，尝试使用 contents API
      try {
        const contentsUrl = `/repos/${owner}/${repo}/contents${path ? '/' + path : ''}`;
        const contentsResponse = await $fetch(contentsUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/vnd.github+json'
          }
        });

        if (contentsResponse.success && Array.isArray(contentsResponse.data)) {
          const contentsData = contentsResponse.data.map((item: any) => ({
            ...item,
            expanded: false,
            loading: false,
            children: item.type === 'dir' ? [] : undefined
          }));

          if (path === '') {
            fileTree.value = contentsData;
          } else {
            updateFileTreeNode(path, contentsData);
          }

          currentPath.value = path;
          return { success: true, data: contentsData };
        }
      } catch (contentsErr) {
        console.error('使用 contents API 获取文件树也失败:', contentsErr);
      }
    } finally {
      fileTreeLoading.value = false;
    }

    // 如果获取失败，设置为空数组，组件会显示空状态
    if (path === '') {
      fileTree.value = [];
    }
    return { success: false };
  };

  // 更新文件树节点
  const updateFileTreeNode = (path: string, children: any[]) => {
    const updateNode = (items: FileTreeItem[], targetPath: string): boolean => {
      for (const item of items) {
        if (item.path === targetPath || item.name === targetPath) {
          item.children = children.map((child: any) => ({
            ...child,
            name: child.name || (child.path ? child.path.split('/').pop() : ''),
            expanded: false,
            loading: false,
            children: (child.type === 'tree' || child.type === 'dir') ? [] : undefined
          }));
          item.loading = false;
          item.expanded = true;
          return true;
        }

        if (item.children && updateNode(item.children, targetPath)) {
          return true;
        }
      }
      return false;
    };

    updateNode(fileTree.value, path);
  };

  // 切换目录展开状态
  const toggleDirectory = async (item: FileTreeItem, owner: string, repo: string) => {
    if (item.type !== 'tree' && item.type !== 'dir') return;

    if (item.expanded) {
      // 收起目录
      item.expanded = false;
      item.children = [];
    } else {
      // 展开目录
      if (!item.children || item.children.length === 0) {
        item.loading = true;

        try {
          // 使用 contents API 获取目录内容
          const contentsUrl = `/repos/${owner}/${repo}/contents/${item.path}`;
          const response = await $fetch(contentsUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/vnd.github+json'
            }
          });

          if (response.success && Array.isArray(response.data)) {
            const contentsData = response.data.map((child: any) => ({
              ...child,
              name: child.name,
              expanded: false,
              loading: false,
              children: child.type === 'dir' ? [] : undefined
            }));

            item.children = contentsData;
            item.expanded = true;
          }
        } catch (err) {
          console.error('获取目录内容失败:', err);
        } finally {
          item.loading = false;
        }
      } else {
        item.expanded = true;
      }
    }
  };

  // 获取 README 文件
  const fetchReadme = async (owner: string, repo: string, commitSha?: string) => {
    readmeLoading.value = true;

    try {
      // 如果没有提供 commitSha，则从当前分支获取
      let refParam = commitSha;
      if (!refParam && currentBranch.value) {
        const currentBranchInfo = branches.value.find(b => b.name === currentBranch.value);
        refParam = currentBranchInfo?.commit.sha;
      }

      // 尝试多种可能的 README 文件名
      const readmeFiles = ['README.md', 'readme.md', 'README.MD', 'README', 'readme', 'README.txt'];

      for (const filename of readmeFiles) {
        try {
          // 构建 URL，如果有 SHA 则添加 ref 参数
          let url = `/repos/${owner}/${repo}/contents/${filename}`;
          if (refParam) {
            url += `?ref=${refParam}`;
          }

          const response = await $fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/vnd.github+json'
            }
          });

          if (response.success && response.data) {
            readme.value = response.data;
            return { success: true, data: response.data };
          }
        } catch (fileErr) {
          // 继续尝试下一个文件名
          continue;
        }
      }

      // 如果所有文件名都尝试失败了
      console.log('未找到 README 文件');
    } catch (err) {
      console.error('获取 README 失败:', err);
    } finally {
      readmeLoading.value = false;
    }

    // 如果获取失败，设置为 null，组件会显示空状态
    readme.value = null;
    return { success: false };
  };

  // 获取语言统计
  // const fetchLanguages = async (owner: string, repo: string) => {
  //   try {
  //     const { success, data } = await $fetch(`/repos/${owner}/${repo}/languages`, {
  //       method: 'get'
  //     });

  //     if (success && data) {
  //       languages.value = data;
  //       return { success: true, data };
  //     }
  //   } catch (err) {
  //     console.error('获取语言统计失败:', err);
  //   }

  //   // 如果获取失败，保持为空对象，组件会显示空状态
  //   return { success: false };
  // };

  // 切换分支
  const switchBranch = async (branchName: string, owner: string, repo: string) => {
    if (branchName === currentBranch.value) return;

    currentBranch.value = branchName;

    // 获取新分支的 commit SHA
    const branchInfo = branches.value.find(b => b.name === branchName);
    const commitSha = branchInfo?.commit.sha;

    // 重新获取文件树和 README
    await Promise.all([
      fetchFileTree(owner, repo, commitSha),
      fetchReadme(owner, repo, commitSha)
    ]);
  };

  // 获取完整的仓库数据
  const fetchRepositoryData = async (owner: string, repo: string) => {
    resetState();

    // 首先获取基本仓库信息
    const repoResult = await fetchRepository(owner, repo);
    console.log('repoResult', repoResult);

    if (!repoResult.success) {
      return repoResult;
    }

    // 先获取分支信息
    await fetchBranches(owner, repo);

    // 获取默认分支的 commit SHA
    const defaultBranchInfo = branches.value.find(b => b.name === currentBranch.value);
    const defaultCommitSha = defaultBranchInfo?.commit.sha;

    // 并行获取其他数据
    await Promise.all([
      // fetchRepositoryStats(owner, repo),
      fetchFileTree(owner, repo, defaultCommitSha),
      fetchReadme(owner, repo, defaultCommitSha),
      // fetchLanguages(owner, repo)
    ]);

    return { success: true };
  };

  return {
    // 状态
    currentRepository,
    repositoryStats,
    branches,
    currentBranch,
    fileTree,
    currentPath,
    readme,
    languages,
    contributors,
    tags,
    latestRelease,

    // 加载状态
    loading,
    branchesLoading,
    fileTreeLoading,
    readmeLoading,
    error,

    // 计算属性
    isRepositoryLoaded,
    defaultBranch,
    repositoryFullName,
    isPrivateRepository,
    primaryLanguage,
    languageStats,
    flatFileTree,

    // Actions
    resetState,
    fetchRepository,
    // fetchRepositoryStats,
    fetchBranches,
    fetchFileTree,
    fetchReadme,
    // fetchLanguages,
    toggleDirectory,
    switchBranch,
    fetchRepositoryData
  };
});

export default useRepositoryStore;
