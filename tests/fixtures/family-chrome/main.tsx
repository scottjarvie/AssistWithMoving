import React from 'react';
import {createRoot} from 'react-dom/client';
import {FamilyRow} from '@/components/family-row';
import {AccountMenu} from '@/components/account-menu';
import '@/app/globals.css';
const p = new URLSearchParams(location.search);
document.documentElement.classList.toggle('dark',p.get('theme')!=='light');
createRoot(document.getElementById('root')!).render(<><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4"><strong>Assist With Moving</strong><AccountMenu/></header><main className="min-h-[65vh] p-6"><h1 className="text-2xl">Your moves</h1><p className="my-3 text-muted-foreground">Synthetic component fixture · mocked identity, query and router boundaries.</p><a href="#fixture-link">Underlying link</a></main><div className="pb-[calc(60px+env(safe-area-inset-bottom))] lg:pb-0"><FamilyRow/><footer className="border-t p-6">Product links · Life Support Desk</footer></div><div className="fixed inset-x-0 bottom-0 h-[60px] border-t bg-background p-4 lg:hidden">Moves · Units · Items · Spaces · Queue · Add</div></>);
