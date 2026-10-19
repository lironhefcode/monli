-- Linux distribution reported by the agent at enrollment, e.g.
-- "Ubuntu 22.04 (WSL)". Stored next to os ("linux"), which stays the OS family.
ALTER TABLE "targets" ADD COLUMN "distro" TEXT;
