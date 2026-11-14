/// <reference types="vite/client" />

interface Window {
  __SUPABASE_URL?: string;
}

interface ImportMetaEnv {
  readonly VITE_GIT_COMMIT_SHA?: string;
  readonly VITE_BUILD_BRANCH?: string;
  readonly VITE_GITHUB_RUN_ID?: string;
  readonly VITE_GITHUB_RUN_NUMBER?: string;
}
