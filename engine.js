export const LOADS=[
 {id:"comms",name:"Radio/VHF, LEDs, telemoveis e controlo",priority:1,dailyKwh:.55},
 {id:"cold",name:"Frigorifico de medicamentos",priority:1,dailyKwh:.9},
 {id:"pump",name:"Bomba DC e deposito elevado",priority:1,dailyKwh:.5,schedule:[6,8]},
 {id:"secondary",name:"Iluminacao adicional e carregamentos",priority:2,dailyKwh:.3,schedule:[18,24]}
];
export const DEFAULTS={duration:72,timeStepHours:.25,solarKwp:2,batteryKwh:10,initialSoc:100,usableBatteryPercent:80,deliveryEfficiency:90,chargeEfficiency:94,panelDamage:0,cloud:100,inverterKw:2,waterPeakM:3.4,fixedCabinetM:1.2,guideHeightM:4.5,moduleMassKg:360,drumCount:4,drumLitres:200,requiredDisplacementLitresPerKg:2,cableTravelM:3.1,debrisRisk:15,guideFailure:false,sensorFailure:false,controllerFailure:false,leakage:false,portablePackKwh:.65,loadMultiplier:1,batteryDegradation:0};
const daylight=h=>h>=6&&h<=18?Math.sin((h-6)/12*Math.PI):0;
const active=(load,h)=>!load.schedule||(h>=load.schedule[0]&&h<load.schedule[1]);
export function simulate(input={}){
 const p={...DEFAULTS,...structuredClone(input)},dt=p.timeStepHours,steps=Math.round(p.duration/dt),series=[],events=[];
 const usableFraction=Math.max(0,p.usableBatteryPercent/100-p.batteryDegradation/100),floor=p.batteryKwh*(1-usableFraction),eff=p.deliveryEfficiency/100;
 let battery=p.batteryKwh*p.initialSoc/100,pack=p.portablePackKwh,isolated=false,firstP1Failure=null,previousFloat=false,previousIsolation=false;
 const uptime={comms:0,cold:0,pump:0},requested={comms:0,cold:0,pump:0};
 for(let i=0;i<steps;i++){
  const t=i*dt,h=t%24,water=p.waterPeakM*Math.max(0,Math.sin(Math.PI*t/p.duration)),buoyancy=p.drumCount*p.drumLitres,moduleY=water>p.fixedCabinetM?Math.min(water,p.guideHeightM):p.fixedCabinetM;
  const floats=water>p.fixedCabinetM,stable=buoyancy+1e-9>=p.moduleMassKg*p.requiredDisplacementLitresPerKg,travel=moduleY-p.fixedCabinetM;
  const guideBlocked=p.guideFailure||(p.debrisRisk>75&&water>p.fixedCabinetM),unsafe=floats&&(!stable||guideBlocked||travel>p.cableTravelM||water>p.guideHeightM),sensorTrip=p.sensorFailure&&water>=p.fixedCabinetM,leakTrip=p.leakage&&water>.15;
  isolated=isolated||unsafe||sensorTrip||leakTrip;
  if(floats&&!previousFloat)events.push({t,label:"Modulo inicia flutuacao controlada",kind:"float"});
  if(isolated&&!previousIsolation)events.push({t,label:"Isolamento eletrico automatico",kind:"isolate"});
  previousFloat=floats;previousIsolation=isolated;
  const solar=isolated?0:p.solarKwp*daylight(h)*(1-p.cloud/100)*(1-p.panelDamage/100)*.82;
  const desired=LOADS.map(l=>({...l,demand:active(l,h)?l.dailyKwh/(l.schedule?(l.schedule[1]-l.schedule[0]):24)*p.loadMultiplier:0}));
  let availableSolar=solar,served={},mode=battery/p.batteryKwh>=.5?"normal":battery/p.batteryKwh>=.3?"racionamento":"sobrevivencia";
  const allowed=desired.filter(l=>l.priority===1||(mode==="normal"&&!p.controllerFailure));
  let demand=allowed.reduce((s,l)=>s+l.demand,0),direct=Math.min(demand,availableSolar),remaining=demand-direct,deliverable=Math.max(0,battery-floor)*eff/dt,batteryOut=Math.min(remaining,p.inverterKw,deliverable);
  battery-=batteryOut*dt/eff;let supply=direct+batteryOut;
  if(isolated){supply=0;batteryOut=0;direct=0;const comms=desired.find(l=>l.id==="comms").demand,packPower=Math.min(comms,pack/dt);served.comms=packPower;pack-=packPower*dt;}
  allowed.forEach(l=>{if(isolated&&l.id==="comms")return;served[l.id]=Math.min(l.demand,supply);supply-=served[l.id]});
  desired.forEach(l=>served[l.id]??=0);
  const surplus=Math.max(0,solar-direct),charge=Math.min(surplus,p.inverterKw,(p.batteryKwh-battery)/dt)*dt*p.chargeEfficiency/100;battery+=charge;
  for(const id of Object.keys(requested)){const l=desired.find(x=>x.id===id);if(l.demand>0){requested[id]++;if(served[id]+1e-7>=l.demand)uptime[id]++;}}
  const p1Demand=desired.filter(l=>l.priority===1).reduce((s,l)=>s+l.demand,0),p1Served=desired.filter(l=>l.priority===1).reduce((s,l)=>s+served[l.id],0);
  if(firstP1Failure===null&&p1Served+1e-7<p1Demand)firstP1Failure=t;
  series.push({t,water,moduleY,floats,stable,guideBlocked,isolated,solar,demand:desired.reduce((s,l)=>s+l.demand,0),p1Demand,p1Served,batteryKwh:battery,soc:battery/p.batteryKwh*100,packKwh:pack,mode,served});
 }
 const serviceUptime=Object.fromEntries(Object.keys(uptime).map(id=>[id,requested[id]?uptime[id]/requested[id]*100:100])),p1Success=Object.values(serviceUptime).every(v=>v>=99.99),displacementRatio=p.moduleMassKg? p.drumCount*p.drumLitres/p.moduleMassKg:Infinity;
 return {series,events,summary:{p1Success,serviceUptime,firstP1Failure,finalSoc:series.at(-1).soc,isolated:series.some(r=>r.isolated),maxWater:Math.max(...series.map(r=>r.water)),displacementRatio,buoyancyPass:displacementRatio>=p.requiredDisplacementLitresPerKg,energyBudgetKwh:LOADS.reduce((s,l)=>s+l.dailyKwh,0)*3,guaranteedBatteryKwh:p.batteryKwh*usableFraction*eff}};
}
export function seeded(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function monteCarlo(base,n=500,seed=72026){const rnd=seeded(seed),records=[];for(let i=0;i<n;i++){const p={...base,cloud:70+rnd()*30,panelDamage:rnd()*45,waterPeakM:2+rnd()*4,debrisRisk:rnd()*100,batteryDegradation:rnd()*20,loadMultiplier:.9+rnd()*.35,guideFailure:rnd()<.06,sensorFailure:rnd()<.03,leakage:rnd()<.025};records.push({sample:p,result:simulate(p)})}return records}
