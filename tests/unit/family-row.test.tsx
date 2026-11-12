import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { familySites, lifeDirectory, validateFamilyManifest } from "@/lib/family";
import { FamilyRow } from "@/components/family-row";
vi.mock("next/navigation", () => ({usePathname: () => "/"}));
vi.stubGlobal("matchMedia", () => ({matches:false, addEventListener() {}, removeEventListener() {}}));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
describe("Moving family standard — 2026-11-12", () => {
  it("keeps Moving first, the complete dated roster and Life last", () => {
    expect(familySites).toHaveLength(20);
    expect(familySites[0].slug).toBe("moving");
    render(<FamilyRow/>);
    const nav = screen.getByRole("navigation", {name:"Assist With family"});
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent("Moving");
    const links = nav.querySelectorAll('ul a');
    expect(links[links.length-1]).toHaveAttribute("href", lifeDirectory);
    expect(screen.getByRole("button",{name:"All 20"})).toBeInTheDocument();
    expect(nav.querySelector('a[href*="assistwithfood"]')).toBeNull();
  });
  it("fails invalid manifests closed and renders unsafe destinations as labels", () => {
    expect(validateFamilyManifest({version:2})).toBeNull();
    const site = {slug:"one",subject:"One",color:"#123456",status:"Live",href:"javascript:alert(1)"};
    expect(validateFamilyManifest({version:1,home:"https://assistwithlife.com",spaces:[site]})?.spaces[0].href).toBeUndefined();
    expect(validateFamilyManifest({version:1,home:"https://assistwithlife.com",spaces:[site,site]})).toBeNull();
  });
});
