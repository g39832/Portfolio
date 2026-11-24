#!/bin/bash
# IaC lab: an Ansible playbook that manages folders in this lab, and an OpenTofu config.
set -e
cd "$HOME"
mkdir -p ansible tofu answers
cat > ansible/inventory.ini <<'I'
[lab]
localhost ansible_connection=local ansible_python_interpreter=/usr/bin/python3
I
cat > ansible/site.yml <<'Y'
# Run with:  ansible-playbook -i ansible/inventory.ini ansible/site.yml
- name: Set up my "server" (this lab's home folder)
  hosts: lab
  gather_facts: false
  tasks:
    - name: Make the managed folder
      ansible.builtin.file:
        path: "{{ lookup('env', 'HOME') }}/managed"
        state: directory
        mode: "0755"
    # Mission: add tasks below this line.
Y
cat > tofu/main.tf <<'T'
# Run in ~/tofu:  tofu init, tofu plan, tofu apply
terraform {
  required_providers {
    local = { source = "hashicorp/local", version = "~> 2.5" }
  }
}

variable "greeting" {
  type    = string
  default = "hello from tofu"
}

resource "local_file" "hello" {
  filename = "${path.module}/out/hello.txt"
  content  = "${var.greeting}\n"
}
T
printf 'IaC lab. Ansible in ~/ansible, OpenTofu in ~/tofu.\n' > README.txt
