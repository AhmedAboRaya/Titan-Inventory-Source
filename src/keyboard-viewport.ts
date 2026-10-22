/** Keep editors reachable as mobile browser/IME viewports change; never rewrite input. */
export function installKeyboardViewport():()=>void{
 let frame=0;
 const update=()=>{
  frame=0;const viewport=window.visualViewport;
  const top=viewport?.offsetTop||0,height=viewport?.height||window.innerHeight;
  document.documentElement.style.setProperty('--inventory-viewport-height',`${height}px`);
  document.documentElement.style.setProperty('--inventory-viewport-top',`${top}px`);
  const field=document.activeElement;
  if(!(field instanceof HTMLElement)||!field.matches('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea,select,[contenteditable=true]'))return;
  const modal=field.closest<HTMLElement>('.modal');
  let upper=top+12;
  if(modal)upper=Math.max(upper,modal.getBoundingClientRect().top+12);
  else for(const selector of ['.topbar','.sidebar']){
   const bar=document.querySelector<HTMLElement>(selector);
   if(bar&&getComputedStyle(bar).position==='sticky')upper=Math.max(upper,bar.getBoundingClientRect().bottom+12);
  }
  const lower=top+height-20,rect=field.getBoundingClientRect();
  // A tall textarea must still expose its first editable line on a short screen.
  const delta=rect.top<upper?rect.top-upper:rect.bottom>lower?Math.min(rect.bottom-lower,Math.max(0,rect.top-upper)):0;
  if(Math.abs(delta)>1){
   if(modal)modal.scrollBy({top:delta,behavior:'instant'});
   else window.scrollBy({top:delta,behavior:'instant'});
  }
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
 window.addEventListener('resize',schedule);window.addEventListener('focusin',schedule);
 window.visualViewport?.addEventListener('resize',schedule);
 window.visualViewport?.addEventListener('scroll',schedule);schedule();
 return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('focusin',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule)};
}
