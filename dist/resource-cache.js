import * as THREE from 'three';

// Equal image bytes and sampler settings share one decoded image and GPU texture.
// Only the four common CD surfaces live for the lifetime of the scene.
export class SceneResources {
 constructor(){
  THREE.Cache.enabled=true;
  this.textures=new Map();this.geometries=new Map();this.materials=new WeakMap();
 }
 texture(source,used,albedo=false){
  if(!source)return null;
  if(albedo)source.anisotropy=Math.min(2,source.anisotropy||2);
  const key=JSON.stringify([source.name,source.colorSpace,source.channel,source.flipY,source.wrapS,source.wrapT,source.magFilter,source.minFilter,source.anisotropy,source.offset.toArray(),source.repeat.toArray(),source.center.toArray(),source.rotation]);
  let entry=this.textures.get(key);
  if(!entry){entry={texture:source,refs:0,shared:source.name.startsWith('shared:')};this.textures.set(key,entry);}
  else if(entry.texture!==source)source.dispose();
  if(!used.has(key)){used.add(key);entry.refs++;}
  return entry.texture;
 }
 geometry(key,source){
  const existing=this.geometries.get(key);
  if(existing){if(existing!==source)source.dispose();return existing;}
  this.geometries.set(key,source);return source;
 }
 release(keys){
  for(const key of keys||[]){
   const entry=this.textures.get(key);if(!entry)continue;
   entry.refs=Math.max(0,entry.refs-1);
   if(entry.refs||entry.shared)continue;
   this.textures.delete(key);entry.texture.dispose();
   const image=entry.texture.source.data;
   if(![...this.textures.values()].some(other=>other.texture.source.data===image))this.releaseImage(image);
  }
 }
 releaseImage(image){
  for(const [key,value] of Object.entries(THREE.Cache.files))if(value===image)THREE.Cache.remove(key);
  if(typeof image?.close==='function')image.close();
 }
 releaseArtwork(texture){if(!texture)return;texture.dispose();this.releaseImage(texture.source.data);}
 stats(){
  const images=new Set();let decodedBytes=0,labels=0;
  for(const entry of this.textures.values()){
   const image=entry.texture.source.data;if(!entry.shared)labels++;
   if(image&&!images.has(image)){images.add(image);decodedBytes+=image.width*image.height*4;}
  }
  return {pooledTextures:this.textures.size,labelTextures:labels,sharedGeometries:this.geometries.size,decodedMiB:Math.round(decodedBytes/1048576*10)/10};
 }
 dispose(){
  const images=new Set();for(const entry of this.textures.values()){entry.texture.dispose();images.add(entry.texture.source.data);}
  for(const image of images)this.releaseImage(image);
  for(const geometry of this.geometries.values())geometry.dispose();
  this.textures.clear();this.geometries.clear();this.materials=new WeakMap();THREE.Cache.clear();
 }
}
