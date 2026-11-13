import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeAppearance,resolveTheme,appearanceEqual,DEFAULT_APPEARANCE,ACCENTS} from '../src/utils/appearance.js';
test('corrupt or unexpected cached preferences cannot inject style values',()=>{
 assert.deepEqual(normalizeAppearance(null),DEFAULT_APPEARANCE);
 assert.deepEqual(normalizeAppearance({theme:'url(secret)',accent:'red; display:none',density:'tiny',userId:'someone'}),DEFAULT_APPEARANCE);
 assert.deepEqual(normalizeAppearance({theme:'dark',accent:'violet',density:'compact'}),{theme:'dark',accent:'violet',density:'compact'});
});
test('system theme follows the device without changing the saved choice',()=>{
 assert.equal(resolveTheme('system',true),'dark');assert.equal(resolveTheme('system',false),'light');
 assert.equal(resolveTheme('dark',false),'dark');assert.equal(resolveTheme('light',true),'light');
 assert.equal(appearanceEqual(DEFAULT_APPEARANCE,{...DEFAULT_APPEARANCE}),true);
 assert.equal(appearanceEqual(DEFAULT_APPEARANCE,{...DEFAULT_APPEARANCE,density:'compact'}),false);
});
test('all solid accent colors preserve readable white button labels',()=>{
 for(const {color,label} of Object.values(ACCENTS)){
  const channels=color.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];assert.ok(1.05/(luminance+.05)>=4.5,label);
 }
});
