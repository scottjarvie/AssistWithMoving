import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
export default defineConfig({ root: import.meta.dirname, plugins:[react()], css:{postcss:{plugins:[tailwind()]}}, define:{'process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY':JSON.stringify('synthetic')}, resolve:{alias:[{find:'@',replacement:path.join(root,'src')},{find:'@clerk/nextjs',replacement:path.join(import.meta.dirname,'clerk.tsx')},{find:'convex/react',replacement:path.join(import.meta.dirname,'convex.ts')},{find:'next/link',replacement:path.join(import.meta.dirname,'link.tsx')},{find:'next/navigation',replacement:path.join(import.meta.dirname,'navigation.ts')}]}, server:{host:'127.0.0.1',port:3846,strictPort:true,fs:{allow:[root]}} });
