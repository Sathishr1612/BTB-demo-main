-- BTB Academy - 04 first administrator.
-- 1. Dashboard > Authentication > Users > "Add user" > create the owner with email + password
--    (tick "Auto Confirm User"). There is no public sign-up page in this project.
-- 2. Dashboard > Authentication > Sign In / Providers > Email: turn OFF "Allow new users to sign up".
-- 3. Replace the email below with the owner's email and run this in the SQL Editor:
insert into public.admins (user_id)
select id from auth.users where email = 'OWNER_EMAIL@example.com'
on conflict do nothing;
-- Check: select * from public.admins;   (should show exactly one row)
