import assert from "node:assert/strict";
import test from "node:test";
import { buildFurniture,defaultSettings } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { furnitureFeatures,getDesignRecommendations } from "../lib/design-assistant.ts";
test("comparison counts actual built shelves, doors and clothes rails without inventing drawers or capacities",()=>{
  const cabinet=productTemplate("cabinet"),config={...cabinet.defaults,width:1200,height:1800,modules:2,shelves:3,doors:"full"as const};
  const result=buildFurniture(cabinet,config,defaultSettings),features=furnitureFeatures([result]);
  assert.equal(features.furniture,1);assert.equal(features.shelves,6);assert.equal(features.doors,result.doors);assert.equal(features.clothesRails,0);assert.equal(features.drawers,null);
  const wardrobe=productTemplate("wardrobe"),built=buildFurniture(wardrobe,wardrobe.defaults,defaultSettings);
  assert.ok(furnitureFeatures([built]).clothesRails>0);
  assert.deepEqual(furnitureFeatures([result,built]),{furniture:2,shelves:features.shelves+furnitureFeatures([built]).shelves,doors:result.doors+built.doors,clothesRails:furnitureFeatures([built]).clothesRails,drawers:null});
});
test("benefit comparisons only use returned geometry features and public prices",()=>{
  const template=productTemplate("cabinet"),products=[{...template,id:"comparison-one",active:true,pricing:{basis:"unit"as const,amount:300}},{...template,id:"comparison-two",active:true,pricing:{basis:"unit"as const,amount:900},showPrice:false}];
  const original=structuredClone(products),response=getDesignRecommendations({purpose:"storage",width:1800,height:2400,depth:600,budget:500},products,defaultSettings);
  assert.equal(response.options.length,3);
  for(const option of response.options){assert.ok(option.benefits.length>0);assert.equal(option.features.drawers,null);assert.equal(JSON.stringify(option.benefits).includes("900"),false);assert.equal("capacityLitres"in option.features,false);}
  assert.deepEqual(products,original);
  const hidden=getDesignRecommendations({purpose:"storage",width:1800,height:2400,depth:600,budget:1},products.map(product=>({...product,showPrice:false})),defaultSettings);
  assert.ok(hidden.options.every(option=>option.price===null&&option.benefits.every(benefit=>!benefit.includes("S/"))));
});
