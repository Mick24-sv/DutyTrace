import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from './useAuth.jsx';
import {apiGet,apiPut} from '../services/api.js';
import {DEFAULT_APPEARANCE,normalizeAppearance,readAppearance,cacheAppearance,applyAppearance,LAST_APPEARANCE_KEY} from '../utils/appearance.js';
const Context=createContext(null);
function bootAppearance(){try{return normalizeAppearance(JSON.parse(localStorage.getItem(LAST_APPEARANCE_KEY)));}catch{return {...DEFAULT_APPEARANCE};}}
export function AppearanceProvider({children}){
 const {user}=useAuth();const id=user?.id;const activeId=useRef(id);activeId.current=id;
 const [saved,setSaved]=useState(bootAppearance),[preview,setPreviewState]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [dark,setDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const change=()=>setDark(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useLayoutEffect(()=>{setPreviewState(null);if(id)setSaved(readAppearance(id));},[id]);
 useEffect(()=>{if(!id){setLoading(false);setError('');return;}const controller=new AbortController();setLoading(true);setError('');
  apiGet('/auth/appearance',{signal:controller.signal}).then(data=>{if(activeId.current!==id)return;const settings=normalizeAppearance(data.appearance);setSaved(settings);cacheAppearance(id,settings);}).catch(err=>{if(err.name!=='AbortError'&&activeId.current===id)setError(err.message);}).finally(()=>{if(activeId.current===id&&!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[id]);
 useLayoutEffect(()=>applyAppearance(preview??saved,dark),[preview,saved,dark]);
 const setPreview=useCallback(value=>setPreviewState(value?normalizeAppearance(value):null),[]);
 const save=useCallback(async value=>{if(!id)throw new Error('Sign in to save your appearance.');const data=await apiPut('/auth/appearance',normalizeAppearance(value));if(activeId.current!==id)return false;const settings=normalizeAppearance(data.appearance);setSaved(settings);setPreviewState(null);setError('');cacheAppearance(id,settings);return true;},[id]);
 return <Context.Provider value={{saved,preview,setPreview,save,loading,error,resolvedTheme:(preview??saved).theme==='system'?(dark?'dark':'light'):(preview??saved).theme}}>{children}</Context.Provider>;
}
export function useAppearance(){const context=useContext(Context);if(!context)throw new Error('useAppearance requires AppearanceProvider.');return context;}
