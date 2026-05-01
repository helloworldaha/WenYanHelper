import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';

const manifest = {
  manifest_version: 3,
  name: '文言文释义助手',
  version: '1.0.0',
  description: '文言文释义浏览器插件，双击选中文本即可查询释义',
  permissions: ['activeTab', 'storage'],
  host_permissions: ['https://wyw.hwxnet.com/*', 'http://localhost:*/*', 'http://127.0.0.1:*/*'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      css: ['src/styles/styles.css'],
      run_at: 'document_end',
    },
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/index.html',
  },
};

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    crx({ manifest }),
  ],
});
