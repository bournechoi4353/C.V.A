import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out', 'dist', 'node_modules', 'src/renderer/public', 'scripts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
