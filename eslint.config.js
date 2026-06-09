import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out', 'dist', 'node_modules', 'scripts', 'src/main/stt-worker.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
