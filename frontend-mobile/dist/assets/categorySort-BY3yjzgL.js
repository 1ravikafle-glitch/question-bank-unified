const r=/[\u0900-\u097F]/;function i(n){return[...n].sort((t,s)=>{const e=r.test(t)?1:0,o=r.test(s)?1:0;return e!==o?e-o:t.localeCompare(s,void 0,{sensitivity:"base"})})}export{i as s};
