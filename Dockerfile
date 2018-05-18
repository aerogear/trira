# A docker image to help with kerberos for testing
FROM centos/nodejs-6-centos7
MAINTAINER kpiwko@redhat.com

ENV USER=kpiwko

USER root
RUN yum install -y vim krb5-workstation sudo
# allow users in wheel group to run su
RUN sed -i 's/^#\(auth.*sufficient.*pam_wheel.so.*trust.*use_uid\)$/\1/g' /etc/pam.d/su

RUN useradd --groups wheel --create-home --shell /bin/bash $USER

USER $USER
VOLUME ["/trira"]
WORKDIR "/trira"

# you need to configure kerberos on your own
ENTRYPOINT ["/bin/bash"]