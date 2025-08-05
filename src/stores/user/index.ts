import { defineStore } from 'pinia';
import { ref } from 'vue';
import { $fetch } from '@/utils/fetch';
interface UserState {
  id?: string;
  name?: string;
  avatar_url?: string;
  bio?: string;
  email?: string;
  login?: string;
  followers?: number;
  following?: number;
  html_url?: string;
  location?: string;
  total_repos?: number;
}

const useUserStore = defineStore('user', () => {
  const getInitUser = (): UserState => ({
    id: undefined,
    name: undefined,
    avatar_url: undefined,
    bio: undefined,
    email: undefined,
    followers: undefined,
    following: undefined,
    html_url: undefined,
    location: undefined,
    total_repos: undefined,
  });

  const user = ref<UserState>(getInitUser());

  const setInfo = (partial: Partial<UserState>) => {
    user.value = { ...user.value, ...partial };
  }

  const resetInfo = () => {
    user.value = getInitUser();
  }

  // Get user's information
  const fetchInfo = async () => {
    const response = await $fetch('/user', {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json'
      }
    });

    if (response.success && response.data) {
      setInfo({
        ...response.data,
        total_repos: (response.data.public_repos || 0) + (response.data.owned_private_repos || 0)
      })
    }
    return { success: response.success, data: response.data }
  }

  return { user, setInfo, resetInfo, fetchInfo };
});

export default useUserStore;
