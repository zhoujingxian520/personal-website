import { initLibraryNavigation } from './library-navigation';

initLibraryNavigation(
  'writing-library',
  'writing-navigation-status',
  /^(essay|pattern|occ)-/,
  '未找到该位置，请从作文目录或句型索引重新选择。',
);
