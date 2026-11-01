const { chromium } = require('playwright');
// args: dir outPrefix sex
(async()=>{
  const [dir,out,sex,extra] = process.argv.slice(2);
  const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const p = await b.newPage({viewport:{width:240,height:400}});
  const shots=[];
  for (let m=5;m>=1;m--) for (let f=1;f<=5;f++) shots.push([f,m,null]);
  for (const yaw of [0,1.5708,3.1416]) for (let f=1;f<=5;f++) shots.push([f,3,yaw]);
  for (const [f,m,yaw] of shots) {
    await p.goto(`http://127.0.0.1:8766/app.html?sex=${sex}&f=${f}&m=${m}&w=240&h=400${yaw===null?'':'&yaw='+yaw}${extra||''}`);
    await p.waitForFunction('window.done===true',{timeout:120000});
    await p.screenshot({path:`${out}_F${f}M${m}${yaw===null?'':'_y'+yaw}.png`});
  }
  await b.close();
})();
