export const site = {
  name: 'zhoujingxian',
  welcome: '欢迎来到我的世界',
  cover: '/images/cover.webp',
  // 正文背景独立于首页封面，可在此替换本地图片。
  background: '/images/background.webp',
  skillTree: { enabled: true, implemented: false, href: '#skill-tree' },
};

export function sitePath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}
