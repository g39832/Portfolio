# Real Pi (SSH)
This lab is a jump box: ssh pi5 logs you in to the Pi 5 and ssh pi2 to the Pi 4, as grayson with your normal Pi password. Everything you run there is real: kubectl with full admin rights, sudo, your network labs (lab start 1), the Portfolio repo in ~/Portfolio.

Be as careful here as at your desk. The other labs are the safe places to experiment.

To log in with a key instead of a password: ssh-keygen -t ed25519, then ssh-copy-id pi5 and ssh-copy-id pi2.
