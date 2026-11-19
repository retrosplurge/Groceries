-- Let signed-in users reach the tables through the app (row level security still limits them to their own household).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function is_member(uuid), create_household(text), join_household(text, text) to authenticated;
notify pgrst, 'reload schema';
