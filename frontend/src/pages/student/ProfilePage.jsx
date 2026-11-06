import {UserRound as UIActionUserRound} from 'lucide-react';
import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {UserRound,GraduationCap,BookOpen,Save,ArrowLeft,Camera,Trash2} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import {useAuth} from '../../hooks/useAuth.jsx';
import {apiPatch,apiUpload,apiDelete} from '../../services/api.js';
import UserAvatar from '../../components/ui/UserAvatar.jsx';

const field='mt-2 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:text-sm';
export default function ProfilePage(){
  const {user,refreshUser}=useAuth();
  const [form,setForm]=useState({fullName:user.fullName,yearLevel:user.yearLevel??'',course:user.course??''});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const photoInput=useRef(null);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [photoError,setPhotoError]=useState('');
  const [photoMessage,setPhotoMessage]=useState('');
  async function changePhoto(file){
    if(!file)return;
    setPhotoError('');setPhotoMessage('');
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>2*1024*1024){setPhotoError('Choose a PNG or JPEG photo up to 2 MB.');return;}
    setPhotoBusy(true);
    try{await apiUpload('/users/me/photo',file);await refreshUser();setPhotoMessage('Profile photo updated.');}
    catch(err){setPhotoError(err.message);}finally{setPhotoBusy(false);}
  }
  async function removePhoto(){
    setPhotoBusy(true);setPhotoError('');setPhotoMessage('');
    try{await apiDelete('/users/me/photo');await refreshUser();setPhotoMessage('Profile photo removed.');}
    catch(err){setPhotoError(err.message);}finally{setPhotoBusy(false);}
  }
  const set=key=>event=>{setForm(f=>({...f,[key]:event.target.value}));setMessage('');};
  async function save(event){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      const {user:updated}=await apiPatch('/users/me/profile',{fullName:form.fullName.trim(),yearLevel:form.yearLevel===''?null:Number(form.yearLevel),course:form.course.trim()||null});
      setForm({fullName:updated.fullName,yearLevel:updated.yearLevel??'',course:updated.course??''});
      await refreshUser();setMessage('Your profile has been saved. Your administrator can now see your updated details.');
    }catch(err){setError(err.details?Object.values(err.details).join(' '):err.message);}finally{setBusy(false);}
  }
  return <>
    <Link to="/student" className="mb-4 inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-teal shadow-sm transition-colors hover:border-teal/40 hover:bg-teal/5 active:bg-teal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 sm:px-4"><ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0"/><span>Back to home</span></Link>
    <PageHeader icon={UIActionUserRound} title="My Profile" description="Keep your name, year level, and course up to date."/>
    <Card title="Profile picture" className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <UserAvatar user={user} className="h-24 w-24 text-2xl"/>
        <div className="min-w-0"><p className="mb-3 text-sm text-muted">Choose a PNG or JPEG photo up to 2 MB. It appears in your account menu and your administrator's student overview.</p>
          <input ref={photoInput} hidden type="file" accept="image/png,image/jpeg" aria-label="Choose profile picture" onChange={e=>{changePhoto(e.target.files?.[0]);e.target.value='';}}/>
          <div className="flex flex-col gap-2 sm:flex-row"><Button type="button" disabled={photoBusy||busy} onClick={()=>photoInput.current.click()} className="min-h-11"><Camera aria-hidden="true" className="h-4 w-4"/>{photoBusy?'Updating photo…':user.photoUrl?'Change photo':'Add profile picture'}</Button>
            {user.photoUrl&&<Button type="button" variant="secondary" disabled={photoBusy||busy} onClick={removePhoto} className="min-h-11"><Trash2 aria-hidden="true" className="h-4 w-4"/>Remove photo</Button>}
          </div>
          {photoError&&<p role="alert" className="mt-3 text-sm text-bad-fg">{photoError}</p>}
          {photoMessage&&<p role="status" className="mt-3 text-sm text-ok-fg">{photoMessage}</p>}
        </div>
      </div>
    </Card>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={<span className="flex items-center gap-2"><UserRound aria-hidden="true" className="h-4 w-4 text-teal"/>Personal and academic details</span>}>
        <form onSubmit={save} className="space-y-5">
          <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-60">
            <label className="block text-sm font-medium">Full name<input required maxLength={120} autoComplete="name" value={form.fullName} onChange={set('fullName')} className={field}/></label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium"><span className="flex items-center gap-2"><GraduationCap aria-hidden="true" className="h-4 w-4 text-teal"/>Year level</span><select value={form.yearLevel} onChange={set('yearLevel')} className={field}><option value="">Not specified</option>{Array.from({length:8},(_,i)=><option key={i+1} value={i+1}>Year {i+1}</option>)}</select></label>
              <label className="block text-sm font-medium"><span className="flex items-center gap-2"><BookOpen aria-hidden="true" className="h-4 w-4 text-teal"/>Course / program</span><input maxLength={160} value={form.course} onChange={set('course')} className={field} placeholder="e.g. BS Information Technology"/></label>
            </div>
          </fieldset>
          {error&&<p role="alert" className="rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}
          {message&&<p role="status" className="rounded-lg bg-ok-bg p-3 text-sm text-ok-fg">{message}</p>}
          <Button type="submit" disabled={busy||!form.fullName.trim()} className="min-h-11 w-full sm:w-auto"><Save aria-hidden="true" className="h-4 w-4"/>{busy?'Saving…':'Save profile'}</Button>
        </form>
      </Card>
      <Card title="Account and assignment">
        <dl className="space-y-4 text-sm"><div><dt className="text-xs text-muted">Email</dt><dd className="mt-1 break-all">{user.email}</dd></div><div><dt className="text-xs text-muted">Assigned office</dt><dd className="mt-1 break-words">{user.office?.name??'Not assigned'}</dd></div><div><dt className="text-xs text-muted">Role</dt><dd className="mt-1">Student Assistant</dd></div></dl>
        <p className="mt-5 border-t border-line pt-4 text-xs text-muted">Contact your administrator for email, office assignment, or duty-hour requirement changes. Updating your profile keeps previously saved DTR documents unchanged.</p>
      </Card>
    </div>
  </>;
}
