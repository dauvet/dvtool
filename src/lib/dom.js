export const $=(s,r=document)=>r.querySelector(s);export const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));export const on=(el,ev,cb)=>el.addEventListener(ev,cb);
