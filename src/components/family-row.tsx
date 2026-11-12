"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { FamilySurface } from "@/components/family-surface";
import { familySites, lifeDirectory, type FamilySite } from "@/lib/family";

function luminance(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value / 12.92 : ((value+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function dotStyle(site: FamilySite): CSSProperties {
  const light = luminance(site.color);
  // Both the rail and roster backgrounds; neutral if either falls below 3:1.
  return {"--family-dot-light": (.80)/(light+.05) >= 3 ? site.color : "var(--muted-foreground)", "--family-dot-dark": (light+.05)/(.025+.05) >= 3 ? site.color : "var(--muted-foreground)"} as CSSProperties;
}
function SiteContent({site, roster = false}: {site: FamilySite; roster?: boolean}) {
  const current = site.slug === "moving";
  return <><span aria-hidden="true" style={dotStyle(site)} className={`family-dot ${site.status === "In design" ? "family-dot-hollow" : ""}`} /><span>{site.subject}{roster && <small>{current ? "you are here" : site.status === "In design" ? "in the works" : "live"}</small>}</span>{!roster && current && <small className="family-here">HERE</small>}{!roster && site.status === "In design" && <small>soon</small>}</>;
}
export function FamilyRow() {
  const rail = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState(true);
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const measure = () => {
      // Zero-width/hidden rails have not proved that every entry is visible.
      if (node.clientWidth > 0) setOverflow(node.scrollWidth > node.clientWidth + 1);
    };
    if (typeof ResizeObserver === "undefined") { measure(); return; }
    const observer = new ResizeObserver(measure);
    observer.observe(node); measure();
    return () => observer.disconnect();
  }, []);
  return <nav aria-label="Assist With family" className="family-row">
    <ul ref={rail} className={`family-rail ${overflow ? "family-overflow" : ""}`} onFocusCapture={event => {
      if (event.target instanceof HTMLAnchorElement) event.target.scrollIntoView({block:"nearest",inline:"nearest"});
    }}>
      <li className="family-kicker">Assist With</li>
      {familySites.map(site => <li key={site.slug}>{site.slug === "moving" ? <span className="family-entry family-current" aria-current="page"><SiteContent site={site}/></span> : site.href ? <a className="family-entry" href={site.href}><SiteContent site={site}/></a> : <span className="family-entry"><SiteContent site={site}/></span>}</li>)}
      <li><a className="family-entry" href={lifeDirectory}>Life · all spaces</a></li>
    </ul>
    {overflow && <div className="family-pin"><FamilySurface label={`All ${familySites.length}`} title={`Assist With · ${familySites.length} sites`} roster trigger={<>All {familySites.length}<ChevronDown aria-hidden="true" /></>}>
      {close => <div className="family-roster-grid">{familySites.map(site => site.slug === "moving" ? <span key={site.slug} className="family-entry family-current" aria-current="page"><SiteContent site={site} roster/></span> : site.href ? <a key={site.slug} href={site.href} className="family-entry" onClick={close}><SiteContent site={site} roster/></a> : <span key={site.slug} className="family-entry"><SiteContent site={site} roster/></span>)}<a className="family-entry family-life" href={lifeDirectory} onClick={close}>Life · all spaces</a></div>}
    </FamilySurface></div>}
  </nav>;
}
