export const DEFAULT_APPEARANCE={theme:'light',accent:'teal',density:'comfortable'};
export const APPEARANCE_OPTIONS={theme:['light','dark','system'],accent:['teal','blue','violet','rose','amber'],density:['comfortable','compact']};
export const ACCENTS={teal:{label:'Teal',color:'#007f86'},blue:{label:'Blue',color:'#255ed0'},violet:{label:'Violet',color:'#7047c9'},rose:{label:'Rose',color:'#b83268'},amber:{label:'Amber',color:'#956300'}};
export const LAST_APPEARANCE_KEY='dutytrace:appearance:last';
export function normalizeAppearance(value){return Object.fromEntries(Object.entries(APPEARANCE_OPTIONS).map(([key,values])=>[key,values.includes(value?.[key])?value[key]:DEFAULT_APPEARANCE[key]]));}
export const appearanceEqual=(a,b)=>Object.keys(DEFAULT_APPEARANCE).every(key=>a[key]===b[key]);
export const resolveTheme=(theme,prefersDark)=>theme==='system'?(prefersDark?'dark':'light'):theme;
export function readAppearance(userId){try{return normalizeAppearance(JSON.parse(localStorage.getItem(`dutytrace:appearance:${userId}`)));}catch{return {...DEFAULT_APPEARANCE};}}
export function cacheAppearance(userId,appearance){try{const value=JSON.stringify(normalizeAppearance(appearance));localStorage.setItem(`dutytrace:appearance:${userId}`,value);localStorage.setItem(LAST_APPEARANCE_KEY,value);}catch{/* Private browsing can disable storage; server preferences still work. */}}
export function applyAppearance(appearance,prefersDark){const root=document.documentElement;root.dataset.theme=resolveTheme(appearance.theme,prefersDark);root.dataset.themeChoice=appearance.theme;root.dataset.accent=appearance.accent;root.dataset.density=appearance.density;root.style.colorScheme=root.dataset.theme;}
