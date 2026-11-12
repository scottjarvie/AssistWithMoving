import React from 'react';
const p = new URLSearchParams(location.search);
export const useUser = () => ({isLoaded:p.get('auth')!=='loading',isSignedIn:p.get('auth')!=='out',user:{fullName:'Alexandra Morgan '.repeat(4).slice(0,60),firstName:'Alexandra',username:'alex',primaryEmailAddress:{emailAddress:'alexandra.morgan.long.synthetic.identity@example.invalid'}}});
export const useClerk = () => ({signOut:async()=>{if(p.has('error'))throw Error('Synthetic sign-out failure');}});
export const SignInButton = ({children}:{children:React.ReactNode}) => children;
export const SignUpButton = SignInButton;
