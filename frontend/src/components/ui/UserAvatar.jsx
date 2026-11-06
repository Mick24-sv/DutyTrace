import {useState} from 'react';
import {apiUrl} from '../../services/api.js';
export default function UserAvatar({user,className=''}){
  const [failedUrl,setFailedUrl]=useState(null);
  const [loadedUrl,setLoadedUrl]=useState(null);
  const photo=user.photoUrl&&failedUrl!==user.photoUrl;
  const loaded=photo&&loadedUrl===user.photoUrl;
  return <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white ${className}`}>
    <span className={loaded?'invisible':''}>{(user.fullName??'').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span>
    {photo&&<img src={apiUrl(user.photoUrl)} alt="" onLoad={()=>setLoadedUrl(user.photoUrl)} onError={()=>setFailedUrl(user.photoUrl)} className={`absolute inset-0 h-full w-full object-cover ${loaded?'opacity-100':'opacity-0'}`}/>}
  </span>;
}
