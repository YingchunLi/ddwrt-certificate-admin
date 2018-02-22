# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project (kind of) adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Todos]
- [ ] I'm thinking we should add two more UI elements to the "Other Options" section. These will decide whether to use SHA1 and Blowfish, or other algorithms instead. I'll get you more information on that, but they would both be drop-downs, and would affect the last set of lines in the configurator output, as well as a line or two in the .ovpn file output.


## [Unreleased]
## [0.9.0] - 2018-02-10
Import code to github
### Changed
- Fix issue when ca file does not exist
- Conditionally load react plugin
- Update [README.md](README.md) file

## [0.8.3] - 2017-11-30
### Changed
- Make 'configurator output' certificate boxes show 6 lines
- Make 'Public IP or DDNS Address of Router' check more user friendly

## [0.8.2] - 2017-11-29
### Changed
- Make 'configurator output' certificate boxes take more horizontal space

## [0.8.1] - 2017-11-26
### Changed
- Ping public ip/DDNS and warns if not alive
- Warns if 'Internal Network to be accessed' does not ends with '0'

## [0.7.0] - 2017-11-01
### Added
- Parameter for 'router internal IP' (defaults to internal network with last bit to 1)
- Generation of client .opvn files

### Changed
- Set default value of 'Internal Network to be accessed' to the private ip address of the computer running the app with last digit changed to '1'.
- Use snackbar/toast style message notification instead of alert box to avoid user interaction
 
## [0.6.0] - 2017-10-28
### Added
- 'Additional Config' content
- Auto fill (fist) public (not tested) and private ip address


## [0.5.2] - 2017-10-25
### Added
- Icon buttons to copy configurator output text areas content to clipboard
- Place holder for `iptables change`
- Option to specify directory to place generated user certificates/private keys

### Changed
- Adjust layout of 'Configurator output' page
- Put generated user certificates/keys under a sub directory named by user name

### Changed

## [0.5.1] - 2017-10-24
### Added
- Password protection option of client private key

### Changed
- Input validation: All inputs only allow ASCII
- Input validation: Port range from 1 - 6555
- Input validation: IP address pattern for fields:
  * Public IP or DDNS Address of Router
  * Internal Network to be accessed
  * Network segments for VPN Clients
  * Subnet Mask for VPN Clients
- Client options: Add username collision indicator
- Client options: Default usernames to `client1, client2...`
- Client options: Removed 'Card expander' to allow fast navigation of inputs via tab key

## [0.5.0] - 2017-10-23
### Added
- private key/certificates for multiple clients configurator support
- Status update for configurator status
- Make UI responsible while generating DH perm


## [0.4.2] - 2017-10-19
### Added
- Generate DH pem (both show on UI and save as file dh.pem)

### Changed
- Make `Public Server Cert`/`Private Server Key`/`DH Pem` output readonly to avoid accidentally change

## [0.4.1] - 2017-10-17
### Added
- Create Client certificate

## [0.4.0] - 2017-10-15
### Added
- [backend] Generate root CA key pair and CA root cert.
- [backend] Generate client key pair.
- [ui]A generate button in 'Configurator output' tab to run the generate process. 
- [ui]Option to regenerate CA (backend logic not ready yet)

### Changed
- Hide `PCKS11 Module Path` and `PCKS11 PIN` options for now. 

## [0.3.0] - 2017-10-09
### Added
- Executable icon.

### Fixed
- `Internal Network to be access` needs to be `accessed`.
- Hide password row in **Usernames and passwords** page when `Certificate-only authentication` is set to true.
- On the **Configurator Output** page, the first option should say `Server Up` if the `start with wan up" option` on the first page is set to `no`, rather than `no wan up`. 

### Changed
- Default all `other options` to the `yes` option.
- `Key Size` uses dropdown of values `1024`, `2048`, or `4096`.



## [0.2.0] - 2017-10-05
### Changed
- Change main page layout from **tabs** to **stepper**/**wizard**.

### Added
- 'Usernames and passwords' page.
- 'Configurator Output' page.
- UI interaction on 'VPN parameters' page.

## [0.1.0] - 2017-10-01
### Added
- Windows portable executable build using **electron-builder**
- [UI] Tabs layout and static 'VPN parameters' page.
