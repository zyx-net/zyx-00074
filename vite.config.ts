import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          try {
            options.startup()
          } catch (e) {
            console.error('\n❌ Electron 启动失败：')
            console.error('   请确保 Electron 已正确安装：')
            console.error('   npm install electron --no-save')
            console.error('   或使用国内镜像：')
            console.error('   $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" ; npm install electron')
            console.error('\n   当前 Vite 服务仍在运行，可通过 http://localhost:5173 访问\n')
          }
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['fs', 'path', 'electron']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
