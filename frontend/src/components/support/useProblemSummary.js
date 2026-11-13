import {useEffect,useState} from 'react';
import {apiGet} from '../../services/api.js';
export default function useProblemSummary(){
 const [state,setState]=useState({data:null,error:null});
 useEffect(()=>{let active=true;let controller;
  async function update(){if(document.hidden)return;controller?.abort();controller=new AbortController();try{const data=await apiGet('/problem-reports/summary',{signal:controller.signal});if(active)setState({data,error:null});}catch(error){if(active&&error.name!=='AbortError')setState(current=>({...current,error:error.message}));}}
  update();const timer=setInterval(update,30000);window.addEventListener('focus',update);window.addEventListener('problem-reports-updated',update);document.addEventListener('visibilitychange',update);
  return ()=>{active=false;controller?.abort();clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('problem-reports-updated',update);document.removeEventListener('visibilitychange',update);};
 },[]);return state;
}
