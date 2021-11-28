Node.js multitenant app based on https://www.youtube.com/watch?v=E816z61O_S8&list=PLkzo92owKnVx3Sh0nemX8GoSNzJGfsWJM&index=1


cf set-env multitenantapp1-srv cf_api_user '<email>'
  cf set-env multitenantapp1-srv cf_api_password '<password>'
  cf restage multitenantapp1-srv
Don't forget to configure the destination for each subscriber.


