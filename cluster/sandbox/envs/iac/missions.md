# Ansible & OpenTofu
Infrastructure as code means you describe what you want in files and a tool makes it so, the same way every time. Here Ansible manages this lab's home folder as if it were a server, and OpenTofu (the open-source Terraform) manages files. Real use would point the same files at your Pis or Cloudflare.

## Run your first playbook
Run ~/ansible/site.yml. Then run it again: the second run should change nothing ("changed=0"). That's idempotence.
hint: ansible-playbook -i ~/ansible/inventory.ini ~/ansible/site.yml
check: [ -d managed ]

## Add a task
Add a task that writes a file ~/managed/motd containing exactly "managed by ansible" (use ansible.builtin.copy with content:), then run the playbook.
hint:     - name: Message of the day
hint:       ansible.builtin.copy:
hint:         dest: "{{ lookup('env', 'HOME') }}/managed/motd"
hint:         content: "managed by ansible\n"
check: [ "$(cat managed/motd 2>/dev/null)" = "managed by ansible" ] && grep -q 'ansible.builtin.copy' ansible/site.yml

## Loops
Add one task that makes three folders under ~/managed/apps: web, blog and ledger, using loop:.
hint: ansible.builtin.file: path: "{{ lookup('env','HOME') }}/managed/apps/{{ item }}" state: directory  /  loop: [web, blog, ledger]
check: [ -d managed/apps/web ] && [ -d managed/apps/blog ] && [ -d managed/apps/ledger ] && grep -q 'loop:' ansible/site.yml

## Plan, then apply
In ~/tofu, run tofu init (downloads the "local" provider), then tofu plan to see what would happen, then tofu apply.
hint: cd ~/tofu && tofu init && tofu plan && tofu apply
check: [ -f tofu/out/hello.txt ] && [ -f tofu/terraform.tfstate ]

## Change a variable
Change the greeting to "hello from tofu v2" without editing main.tf (use -var), and see the plan show a replacement before you apply.
hint: tofu apply -var 'greeting=hello from tofu v2'
check: grep -qx 'hello from tofu v2' tofu/out/hello.txt

## Drift
Edit tofu/out/hello.txt by hand, then run tofu plan. OpenTofu notices the file no longer matches the code. Save the number it says it will add, change, or destroy ("Plan: 1 to add...") as just the "to add" number in ~/answers/drift.txt, then apply to fix it.
hint: echo tampered > ~/tofu/out/hello.txt && cd ~/tofu && tofu plan -var 'greeting=hello from tofu v2'
check: grep -qx 1 answers/drift.txt

## Outputs
Add an output block to main.tf that prints the file's path (local_file.hello.filename), apply, and read it with tofu output.
hint: output "path" { value = local_file.hello.filename }
hint: tofu apply -var 'greeting=hello from tofu v2' && tofu output
check: grep -q '^output' tofu/main.tf && cd tofu && tofu output -raw path >/dev/null 2>&1
