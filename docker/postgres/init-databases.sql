-- Local stacks only (docker compose, dev Kubernetes overlay): one database and one login role
-- per service. A service can only reach its own database. Runs once, on an empty data volume.
-- In production each service gets its own (managed) database created out of band.

CREATE ROLE identity LOGIN PASSWORD 'identity_dev_password';
CREATE DATABASE cargo_identity OWNER identity;

CREATE ROLE master_data LOGIN PASSWORD 'master_data_dev_password';
CREATE DATABASE cargo_master_data OWNER master_data;

CREATE ROLE shipments LOGIN PASSWORD 'shipments_dev_password';
CREATE DATABASE cargo_shipments OWNER shipments;

-- Nobody else may connect to a service database.
REVOKE CONNECT ON DATABASE cargo_identity FROM PUBLIC;
REVOKE CONNECT ON DATABASE cargo_master_data FROM PUBLIC;
REVOKE CONNECT ON DATABASE cargo_shipments FROM PUBLIC;
