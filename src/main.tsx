import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./App';import'./style.css';
import{installKeyboardViewport}from'./keyboard-viewport';
installKeyboardViewport();
createRoot(document.getElementById('root')!).render(<App/>);

if(!window.TitanInventory&&'serviceWorker'in navigator)navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{scope:import.meta.env.BASE_URL}).catch(()=>{});
