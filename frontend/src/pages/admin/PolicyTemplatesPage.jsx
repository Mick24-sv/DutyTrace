import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, Eye, FilePlus2, History, Save, Send } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { apiGet, apiPost, apiPut } from '../../services/api.js';

const field='mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const emptyConfig={
  duty:{requiredTermHours:null,minimumDailyHours:null,maximumDailyHours:null,maximumWeeklyHours:null,permittedWeekdays:[],permittedTimeWindows:[],completionDeadline:null},
  attendance:{earlyClockInToleranceMinutes:null,lateClockOutToleranceMinutes:null,missingClockOutGraceMinutes:null,duplicateScanHandling:null,attendanceOutsideApprovedShift:null,approvedOvertimeAllowed:null,correctionApproval:null,supervisorReviewRequired:null,discrepancyEscalationHours:null},
  absence:{advanceExplanationRequired:null,submissionDeadlineHours:null,supervisorReviewRequired:null,supportingDocumentRequired:null,incompleteDutyExplanationRequired:null,endOfSemesterOutstandingHourReviewRequired:null,administratorApprovalRequired:null,notifyStudent:null},
  dtr:{requiredMonthlyHours:null,reviewSlaHours:null,institutionName:null,headerText:null,dateFormat:null,timeFormat:null,includeStudentInformation:null,includeOfficeSupervisorInformation:null,includeReportingPeriod:null,includeAttendanceColumns:null,includeDailyTotals:null,includeMonthlyTotals:null,includeVerifiedAdjustments:null,signatureFields:[]},
  transition:{outstandingHoursPolicy:null,requireStudentConfirmation:null,administratorApprovalRequired:null},
  risk:{completionWarningDays:null,criticalCompletionDays:null,deadlineReminderDays:[],upcomingShiftReminderHours:null,escalationAfterHours:null},
};
const sections=[['duty','Duty requirements & scheduling'],['attendance','Attendance rules'],['absence','Absence procedures'],['dtr','Monthly DTR'],['transition','Semester transitions'],['risk','Risk alerts']];
const fields={
  duty:[['requiredTermHours','Default required semester hours','number',0.25,10000],['minimumDailyHours','Minimum daily hours','number',0.25,24],['maximumDailyHours','Maximum daily hours','number',0.25,24],['maximumWeeklyHours','Maximum weekly hours','number',0.25,168],['completionDeadline','Duty completion deadline','date']],
  attendance:[['earlyClockInToleranceMinutes','Allowed early clock-in (minutes)','number',0,1440],['lateClockOutToleranceMinutes','Allowed late clock-out (minutes)','number',0,1440],['missingClockOutGraceMinutes','Missing clock-out grace period (minutes)','number',0,1440],['duplicateScanHandling','Duplicate scan handling','select','reject_and_log','Reject and log','allow_and_flag','Allow and flag'],['attendanceOutsideApprovedShift','Attendance outside approved shift','select','allow_and_flag','Allow and flag','block','Block'],['approvedOvertimeAllowed','Allow approved overtime','boolean'],['correctionApproval','Attendance correction approval','select','supervisor','Supervisor','administrator','Administrator'],['supervisorReviewRequired','Supervisor review required','boolean'],['discrepancyEscalationHours','Discrepancy escalation after (hours)','number',1,720]],
  absence:[['advanceExplanationRequired','Require advance absence explanation','boolean'],['submissionDeadlineHours','Absence submission deadline (hours before shift)','number',0,8760],['supervisorReviewRequired','Require supervisor review','boolean'],['supportingDocumentRequired','Require supporting document','boolean'],['incompleteDutyExplanationRequired','Require explanation for incomplete duty','boolean'],['endOfSemesterOutstandingHourReviewRequired','Review outstanding hours at semester end','boolean'],['administratorApprovalRequired','Require administrator approval','boolean'],['notifyStudent','Notify student of absence decisions','boolean']],
  dtr:[['requiredMonthlyHours','Default monthly DTR hours','number',0.25,744],['reviewSlaHours','DTR review time limit (hours)','number',1,720],['institutionName','DTR institution name','text'],['headerText','DTR header information','text'],['dateFormat','Date format','select','YYYY-MM-DD','YYYY-MM-DD','DD/MM/YYYY','DD/MM/YYYY','MM/DD/YYYY','MM/DD/YYYY'],['timeFormat','Time format','select','12-hour','12-hour','24-hour','24-hour'],['includeStudentInformation','Include student information','boolean'],['includeOfficeSupervisorInformation','Include office and supervisor information','boolean'],['includeReportingPeriod','Include reporting period','boolean'],['includeAttendanceColumns','Include attendance columns','boolean'],['includeDailyTotals','Include daily total hours','boolean'],['includeMonthlyTotals','Include monthly total hours','boolean'],['includeVerifiedAdjustments','Include verified attendance adjustments','boolean']],
  transition:[['outstandingHoursPolicy','Outstanding hours handling','select','keep_original','Keep in original term','manual_review','Require manual review'],['requireStudentConfirmation','Require student confirmation','boolean'],['administratorApprovalRequired','Require administrator approval','boolean']],
  risk:[['completionWarningDays','Completion warning threshold (days)','number',1,180],['criticalCompletionDays','Critical completion threshold (days)','number',0,30],['upcomingShiftReminderHours','Upcoming shift reminder window (hours)','number',1,168],['escalationAfterHours','Alert escalation after (hours)','number',1,720]],
};

function parseHours(value){return value===''?null:Number(value);}
function changedValues(before={},after={},path=''){
  const keys=new Set([...Object.keys(before??{}),...Object.keys(after??{})]);const result=[];
  for(const key of keys){const a=before?.[key],b=after?.[key],name=path?`${path}.${key}`:key;
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))result.push(...changedValues(a,b,name));
    else if(JSON.stringify(a)!==JSON.stringify(b))result.push({name,before:a,after:b});}
  return result;
}

export default function PolicyTemplatesPage(){
  const [templates,setTemplates]=useState([]);const [terms,setTerms]=useState([]);const [offices,setOffices]=useState([]);const [students,setStudents]=useState([]);
  const [selectedId,setSelectedId]=useState('');const [detail,setDetail]=useState(null);const [versionId,setVersionId]=useState('');
  const [name,setName]=useState('');const [description,setDescription]=useState('');const [reason,setReason]=useState('');const [configuration,setConfiguration]=useState(emptyConfig);
  const [activeSection,setActiveSection]=useState('duty');const [termId,setTermId]=useState('');const [scopeType,setScopeType]=useState('institution');const [scopeId,setScopeId]=useState('');const [startsOn,setStartsOn]=useState('');const [endsOn,setEndsOn]=useState('');const [applyReason,setApplyReason]=useState('');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [isNew,setIsNew]=useState(false);const [showPreview,setShowPreview]=useState(false);
  const selectedVersion=detail?.versions?.find((v)=>v.id===versionId)??null;
  const previousVersion=detail?.versions?.find((v)=>v.id===selectedVersion?.previous_version_id)??null;
  const changes=useMemo(()=>changedValues(previousVersion?.configuration??{},configuration),[previousVersion,configuration]);

  async function refreshTemplates(keepId=selectedId){
    const [templateData,termData,officeData]=await Promise.all([apiGet('/policy-templates'),apiGet('/policy-templates/terms'),apiGet('/offices')]);
    const list=templateData.templates??[];setTemplates(list);setTerms(termData.terms??[]);setOffices(officeData.offices??[]);
    if(!termId&&termData.terms?.length){setTermId(termData.terms[0].id);setStartsOn(termData.terms[0].starts_on);setEndsOn(termData.terms[0].ends_on);}
    if(keepId&&list.some((t)=>t.id===keepId))await selectTemplate(keepId);
    else if(list.length)await selectTemplate(list[0].id);
    else {setSelectedId('');setDetail(null);setIsNew(false);setLoading(false);}
  }
  async function selectTemplate(id){
    setLoading(true);setError('');setMessage('');setSelectedId(id);setIsNew(false);
    try{const data=await apiGet(`/policy-templates/${id}`);setDetail(data);const draft=data.versions.find((v)=>v.status==='draft');const version=draft??data.versions[0];
      setVersionId(version?.id??'');setName(data.template.name);setDescription(data.template.description);setConfiguration(version?.configuration??emptyConfig);setReason(version?.change_reason??'');
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{refreshTemplates('').catch((e)=>{setError(e.message);setLoading(false);});},[]);
  useEffect(()=>{if(termId)apiGet(`/semesters/${termId}/requirements`).then((data)=>setStudents(data.requirements??[])).catch(()=>setStudents([]));},[termId]);
  useEffect(()=>{const term=terms.find((entry)=>entry.id===termId);if(term){setStartsOn(term.starts_on);setEndsOn(term.ends_on);}},[termId,terms]);

  function startNew(){setIsNew(true);setSelectedId('');setDetail(null);setVersionId('');setName('');setDescription('');setReason('Initial policy template draft');setConfiguration(structuredClone(emptyConfig));setMessage('');setError('');}
  function updateValue(section,key,value){setConfiguration((current)=>({...current,[section]:{...current[section],[key]:value}}));}
  async function saveDraft(event){event.preventDefault();setBusy(true);setError('');setMessage('');try{
    const payload={name,description,configuration,reason};const saved=isNew?await apiPost('/policy-templates',payload):await apiPut(`/policy-templates/${selectedId}/draft`,payload);
    await refreshTemplates(saved.template.id);setMessage('Draft saved. Published versions remain unchanged.');
  }catch(e){setError(e.message);}finally{setBusy(false);}}
  async function publish(){if(!selectedId||!versionId||selectedVersion?.status!=='draft')return;
    const ok=window.confirm(`Publish ${name} version ${selectedVersion.version_number}? Published versions cannot be edited. You can apply it to an academic term after publishing.`);if(!ok)return;
    setBusy(true);setError('');setMessage('');try{await apiPost(`/policy-templates/${selectedId}/versions/${versionId}/publish`,{confirmed:true});await refreshTemplates(selectedId);setMessage('Policy version published.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function applyVersion(event){event.preventDefault();if(!selectedId||!versionId||selectedVersion?.status!=='published')return;
    const term=terms.find((t)=>t.id===termId);const scopeName=scopeType==='institution'?'the institution':scopeType==='office'?offices.find((o)=>o.id===scopeId)?.name:students.find((s)=>s.studentId===scopeId||s.id===scopeId)?.fullName;
    if(!window.confirm(`Apply published version ${selectedVersion.version_number} to ${scopeName||scopeType} for ${term?.academic_year} ${term?.semester}, ${startsOn} to ${endsOn}? Existing individual requirement assignments will not be changed.`))return;
    setBusy(true);setError('');setMessage('');try{await apiPost(`/policy-templates/${selectedId}/versions/${versionId}/apply`,{termId,scopeType,...(scopeType==='institution'?{}:{scopeId}),effectiveStartsOn:startsOn,effectiveEndsOn:endsOn,reason:applyReason,confirmed:true});
      setApplyReason('');await selectTemplate(selectedId);setMessage('Policy assignment saved with a historical snapshot. Existing student requirement assignments were not changed.');
    }catch(e){setError(e.message);}finally{setBusy(false);}}
  async function duplicate(){if(!selectedId||!selectedVersion)return;const nextName=window.prompt('Name for the duplicate policy template',`${name} copy`);if(!nextName?.trim())return;
    setBusy(true);setError('');try{const created=await apiPost(`/policy-templates/${selectedId}/duplicate`,{versionId:selectedVersion.id,name:nextName.trim(),description,reason:'Duplicated from an existing policy version'});await refreshTemplates(created.template.id);setMessage('Template duplicated as a new draft.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function archive(){if(!selectedId||!window.confirm(`Archive “${name}”? Existing policy assignments will remain active and preserved.`))return;
    setBusy(true);setError('');try{await apiPost(`/policy-templates/${selectedId}/archive`,{confirmed:true});setMessage('Template archived. Existing assignments remain unchanged.');await refreshTemplates('');}catch(e){setError(e.message);}finally{setBusy(false);}}

  const renderInput=(section,definition)=>{const [key,label,type,a,b]=definition;const value=configuration[section]?.[key];
    if(type==='boolean')return <label key={key} className="block text-sm text-muted">{label}<select className={field} value={value==null?'':String(value)} onChange={(e)=>updateValue(section,key,e.target.value===''?null:e.target.value==='true')}><option value="">Inherit existing setting</option><option value="true">Yes</option><option value="false">No</option></select></label>;
    if(type==='select'){const options=definition.slice(3);return <label key={key} className="block text-sm text-muted">{label}<select className={field} value={value??''} onChange={(e)=>updateValue(section,key,e.target.value||null)}><option value="">Inherit existing setting</option>{Array.from({length:options.length/2},(_,i)=><option key={options[i*2]} value={options[i*2]}>{options[i*2+1]}</option>)}</select></label>;}
    return <label key={key} className="block text-sm text-muted">{label}<input className={field} type={type} min={a} max={b} step={type==='number'?'0.25':undefined} value={value??''} onChange={(e)=>updateValue(section,key,type==='number'?parseHours(e.target.value):e.target.value||null)} /></label>;
  };

  return <>
    <PageHeader title="Institution Policy Templates" description="Create institution-owned policy versions, preview changes, and apply them by academic term and scope. Published versions and their assignments are preserved." />
    {error&&<p role="alert" className="mb-4 rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}{message&&<p role="status" className="mb-4 rounded-lg bg-ok-bg p-3 text-sm text-ok-fg">{message}</p>}
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <label className="min-w-56 flex-1 text-sm text-muted">Policy template<select className={field} value={selectedId} onChange={(e)=>e.target.value?selectTemplate(e.target.value):startNew()}><option value="">Choose a template</option>{templates.map((template)=><option key={template.id} value={template.id}>{template.name} · {template.status}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={startNew}><FilePlus2 className="mr-1 inline h-4 w-4"/>New template</Button>{!!selectedVersion&&<Button type="button" onClick={duplicate}><CopyPlus className="mr-1 inline h-4 w-4"/>Duplicate version</Button>}</div>
    </div>
    {loading&&<p role="status" className="mb-3 text-sm text-muted">Loading templates…</p>}
    {(isNew||detail)&&<>
      <Card className="mb-5" title={isNew?'Create a policy template':'Template details'}>
        <form onSubmit={saveDraft}>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-muted">Template name<input required maxLength="120" className={field} value={name} onChange={(e)=>setName(e.target.value)}/></label><label className="text-sm text-muted">Description<input maxLength="2000" className={field} value={description} onChange={(e)=>setDescription(e.target.value)}/></label></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-sm text-muted">Change reason<textarea required minLength="5" maxLength="1000" rows="2" className={field} value={reason} onChange={(e)=>setReason(e.target.value)}/></label><Button type="submit" disabled={busy} className="self-end"><Save className="mr-1 inline h-4 w-4"/>{busy?'Saving…':'Save draft'}</Button></div>
        </form>
        {detail?.versions?.length>0&&<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3"><label className="text-sm text-muted">Version<select className={`${field} min-w-52`} value={versionId} onChange={(e)=>{const v=detail.versions.find((entry)=>entry.id===e.target.value);setVersionId(e.target.value);setConfiguration(v?.configuration??emptyConfig);setReason(v?.change_reason??'');}}>{detail.versions.map((v)=><option key={v.id} value={v.id}>v{v.version_number} · {v.status}</option>)}</select></label><span className="text-xs text-muted">{selectedVersion?.published_at?`Published ${new Date(selectedVersion.published_at).toLocaleString()}`:'Draft, not yet published'}</span><Button type="button" disabled={busy||selectedVersion?.status!=='draft'} onClick={publish}><Send className="mr-1 inline h-4 w-4"/>Publish version</Button><Button type="button" disabled={busy||detail.template.status==='archived'} onClick={archive}>Archive template</Button></div>}
      </Card>
      <Card className="mb-5" title="Configuration">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Policy configuration sections">{sections.map(([id,label])=><button key={id} type="button" role="tab" aria-selected={activeSection===id} onClick={()=>setActiveSection(id)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeSection===id?'bg-teal text-white':'bg-canvas text-muted hover:text-ink'}`}>{label}</button>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">{fields[activeSection].map((definition)=>renderInput(activeSection,definition))}</div>
        {activeSection==='duty'&&<div className="mt-4 space-y-4"><fieldset><legend className="mb-2 text-sm font-medium">Permitted duty days (leave empty to inherit)</legend><div className="flex flex-wrap gap-3">{weekdays.map((label,i)=><label key={label} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={configuration.duty.permittedWeekdays.includes(i+1)} onChange={(e)=>updateValue('duty','permittedWeekdays',e.target.checked?[...configuration.duty.permittedWeekdays,i+1].sort():configuration.duty.permittedWeekdays.filter((day)=>day!==i+1))}/>{label}</label>)}</div></fieldset>
          <fieldset><legend className="mb-2 text-sm font-medium">Permitted time windows</legend>{configuration.duty.permittedTimeWindows.map((window,index)=><div key={index} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2"><label className="text-xs text-muted">From<input className={field} type="time" value={window.startTime} onChange={(e)=>updateValue('duty','permittedTimeWindows',configuration.duty.permittedTimeWindows.map((item,i)=>i===index?{...item,startTime:e.target.value}:item))}/></label><label className="text-xs text-muted">To<input className={field} type="time" value={window.endTime} onChange={(e)=>updateValue('duty','permittedTimeWindows',configuration.duty.permittedTimeWindows.map((item,i)=>i===index?{...item,endTime:e.target.value}:item))}/></label><button type="button" className="min-h-10 px-2 text-sm text-bad-fg" onClick={()=>updateValue('duty','permittedTimeWindows',configuration.duty.permittedTimeWindows.filter((_,i)=>i!==index))}>Remove</button></div>)}{configuration.duty.permittedTimeWindows.length<8&&<Button type="button" onClick={()=>updateValue('duty','permittedTimeWindows',[...configuration.duty.permittedTimeWindows,{startTime:'',endTime:''}])}>Add time window</Button>}</fieldset></div>}
        {activeSection==='risk'&&<label className="mt-3 block text-sm text-muted">Deadline reminder days before due (comma separated; leave blank to inherit)<input className={field} value={configuration.risk.deadlineReminderDays.join(', ')} onChange={(e)=>updateValue('risk','deadlineReminderDays',e.target.value.split(',').map((v)=>v.trim()).filter(Boolean).map(Number))}/></label>}
        {activeSection==='dtr'&&<label className="mt-3 block text-sm text-muted">Signature / approval fields (comma separated)<input className={field} value={configuration.dtr.signatureFields.join(', ')} onChange={(e)=>updateValue('dtr','signatureFields',e.target.value.split(',').map((v)=>v.trim()).filter(Boolean))}/></label>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"><p className="text-xs text-muted">Blank fields inherit the existing institution or lower-level policy. Publishing never changes previously published values.</p><Button type="button" onClick={()=>setShowPreview((v)=>!v)}><Eye className="mr-1 inline h-4 w-4"/>{showPreview?'Hide':'Preview'} changes</Button></div>
        {showPreview&&<div className="mt-3 overflow-x-auto rounded-lg border border-line"><table className="w-full text-left text-xs"><thead className="bg-canvas"><tr><th className="p-2">Setting</th><th className="p-2">Previous version</th><th className="p-2">Proposed value</th></tr></thead><tbody>{changes.length?changes.map((change)=><tr key={change.name} className="border-t border-line"><td className="p-2 font-medium">{change.name}</td><td className="p-2 text-muted">{JSON.stringify(change.before??'—')}</td><td className="p-2">{JSON.stringify(change.after??'—')}</td></tr>):<tr><td className="p-3 text-muted" colSpan="3">No differences from the previous version.</td></tr>}</tbody></table></div>}
      </Card>
      {!!detail?.versions?.length&&<Card className="mb-5" title={<span className="inline-flex items-center gap-2"><History className="h-4 w-4"/>Version history</span>}>
        <ol className="divide-y divide-line">{detail.versions.map((version)=><li key={version.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0"><div><button type="button" onClick={()=>{setVersionId(version.id);setConfiguration(version.configuration);setReason(version.change_reason);}} className="text-sm font-semibold text-navy hover:text-teal">Version {version.version_number} · {version.status}</button><p className="mt-0.5 text-xs text-muted">{version.change_reason}</p><p className="mt-0.5 text-[11px] text-muted">Created {new Date(version.created_at).toLocaleString()}{version.published_at?` · Published ${new Date(version.published_at).toLocaleString()}`:''}</p></div></li>)}</ol>
        {detail.assignments?.length>0&&<><h3 className="mb-2 mt-4 border-t border-line pt-3 text-sm font-semibold">Applied policies</h3><ul className="divide-y divide-line">{detail.assignments.map((assignment)=><li key={assignment.id} className="py-2 text-xs"><strong>v{assignment.version_number}</strong> · {assignment.academic_year} {assignment.semester} · {assignment.scope_type}{assignment.scope_name?` · ${assignment.scope_name}`:''} · {assignment.effective_starts_on} to {assignment.effective_ends_on}<span className="block text-muted">{assignment.reason} · applied by {assignment.applied_by}</span></li>)}</ul></>}
      </Card>}
      <Card title="Apply a published version">
        <form onSubmit={applyVersion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-muted">Academic term<select required className={field} value={termId} onChange={(e)=>setTermId(e.target.value)}><option value="">Select term</option>{terms.map((term)=><option key={term.id} value={term.id}>{term.academic_year} · {term.semester}{term.finalized_at?' · finalized':''}</option>)}</select></label>
          <label className="text-sm text-muted">Policy scope<select className={field} value={scopeType} onChange={(e)=>{setScopeType(e.target.value);setScopeId('');}}><option value="institution">Institution default</option><option value="office">Office override</option><option value="student">Student exception</option></select></label>
          {scopeType==='office'&&<label className="text-sm text-muted">Office<select required className={field} value={scopeId} onChange={(e)=>setScopeId(e.target.value)}><option value="">Choose office</option>{offices.map((office)=><option key={office.id} value={office.id}>{office.name}</option>)}</select></label>}
          {scopeType==='student'&&<label className="text-sm text-muted">Student Assistant<select required className={field} value={scopeId} onChange={(e)=>setScopeId(e.target.value)}><option value="">Choose student</option>{students.map((student)=><option key={student.studentId??student.id} value={student.studentId??student.id}>{student.fullName??student.studentName}</option>)}</select></label>}
          <label className="text-sm text-muted">Effective from<input required className={field} type="date" min={terms.find((t)=>t.id===termId)?.starts_on} max={terms.find((t)=>t.id===termId)?.ends_on} value={startsOn} onChange={(e)=>setStartsOn(e.target.value)}/></label>
          <label className="text-sm text-muted">Effective through<input required className={field} type="date" min={startsOn||terms.find((t)=>t.id===termId)?.starts_on} max={terms.find((t)=>t.id===termId)?.ends_on} value={endsOn} onChange={(e)=>setEndsOn(e.target.value)}/></label>
          <label className="text-sm text-muted sm:col-span-2 lg:col-span-3">Reason for applying this version<textarea required minLength="5" maxLength="1000" className={field} rows="2" value={applyReason} onChange={(e)=>setApplyReason(e.target.value)}/></label>
          <div className="rounded-lg bg-canvas p-3 text-xs text-muted sm:col-span-2 lg:col-span-3"><strong className="text-ink">Before applying:</strong> choose a published version and review its configuration above. Policy assignments are dated and immutable; existing student-specific semester-hour assignments are never replaced. Overlapping assignments are blocked.</div>
          <Button type="submit" disabled={busy||!selectedVersion||selectedVersion.status!=='published'||!termId} className="sm:col-span-2 lg:col-span-3 sm:justify-self-start">Apply selected published version</Button>
        </form>
      </Card>
    </>}
  </>;
}
