// Runs before the application CSS paints. Only allow known preference values.
(()=>{try{const value=JSON.parse(localStorage.getItem('dutytrace:appearance:last'))||{};const root=document.documentElement;
const theme=['light','dark','system'].includes(value.theme)?value.theme:'light';root.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;root.dataset.themeChoice=theme;
root.dataset.accent=['teal','blue','violet','rose','amber'].includes(value.accent)?value.accent:'teal';root.dataset.density=value.density==='compact'?'compact':'comfortable';root.style.colorScheme=root.dataset.theme;}catch{}})();
