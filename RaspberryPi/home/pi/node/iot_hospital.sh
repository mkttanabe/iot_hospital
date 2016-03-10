#!/bin/bash

WVDIAL=/usr/bin/wvdial
DEV=/dev/ttyACM0
NODE=/home/pi/.nvm/versions/node/v0.12.9/bin/node
NODEAPP=/home/pi/node/iot_hospital.js
LOG=/tmp/iot_hospital.log
WVDIALPID=""

echo "start" > $LOG

# check L-05A
check=`lsusb|grep "LG Elec"`
if [ -z "$check" ]; then
  echo "not found L-05A. exiting.." >> $LOG
  exit 0
fi

# connect to internet
for i in {0..5}; do
  if [ -e $DEV ]; then
    echo "found $DEV. trying to call.." >> $LOG
    for j in {0..5}; do
      $WVDIAL 2>> $LOG &
      WVDIALPID=$!
      sleep 5
      if [ -x /proc/$WVDIALPID ]; then
        echo "wvdial process is established" >> $LOG
        break
      else
        echo "wvdial process is gone. retrying.." >> $LOG
        WVDIALPID=""
      fi
    done;
    if [ ! -z "$WVDIALPID" ]; then
      break
    fi
  else
    echo "not found $DEV. retrying.." >> $LOG
    sleep 3
  fi
done;

if [ -z "$WVDIALPID" ]; then
  exit 0
fi

# execute app
for i in {0..5}; do
  check=`ifconfig |grep ppp0`
  if [ -z "$check" ]; then
    sleep 3
  else
    $NODE $NODEAPP >> $LOG &
    break
  fi
done;
