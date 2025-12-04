import { defineConfig } from 'vite';

export default defineConfig({
  // Untuk Netlify, serve dari root ("/"). Jika Anda hendak melayani dari subpath,
  // ubah base menjadi '/your-subpath/'.
  base: '/'
});