# Canvas-plus
491A project environment
# 1
run these prompts in terminal
npm init -y
npm install express pg dotenv
# 2
install/setup PostgreSQL Database 
in seperate terminal run this less of a headache
curl -O https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64.exe
then 
.\postgresql-16.2-1-windows-x64.exe
leave everything default and let it install will take a fat min
after install 
go to C:\Program Files\PostgreSQL\16\bin or wherever its at as long as the last three are right
in terminal
psql -U postgres
CREATE DATABASE canvasplus_db;
# 3 
back to vs code
create .env 
file copy all this but put ur password u made 
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=******
DB_NAME=canvasplus_db
# 4
run the script in the project terminal should work hopefully
node test-db.js