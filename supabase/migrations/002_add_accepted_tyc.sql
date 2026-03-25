ALTER TABLE agentes ADD COLUMN IF NOT EXISTS accepted_tyc BOOLEAN DEFAULT false;

-- Allow agents to update their own record (needed for accepting TyC, changing profile, etc.)
CREATE POLICY agentes_update ON agentes FOR UPDATE
  USING (auth_uid = auth.uid());
